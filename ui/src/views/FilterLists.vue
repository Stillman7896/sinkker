<script setup>
import { ref, computed } from 'vue';
import { state, runOp, boot, loadLists, loadBlocklists, setRoute } from '../store.js';
import { t } from '../i18n.js';
import { api } from '../api.js';
import AppButton from '../components/AppButton.vue';
import ConfirmButton from '../components/ConfirmButton.vue';
import {
  normalizeTld,
  normalizeKeyword,
  normalizeRegex,
  isHttpsUrl,
  MAX_BLOCKLIST_URLS,
  BLOCKLIST_ENTRY_LIMIT,
} from '../validate.js';

const FORMS = [
  {
    id: 'tlds',
    key: 'tld',
    title: 'Blocked TLDs',
    hint: 'Stops any query whose last label matches — the whole zone is off limits.',
    invalid: 'One label only, e.g. “zip”. Use a rule for “co.uk”.',
    placeholder: 'zip',
    empty: 'Add a suffix like “xyz” to start stopping queries.',
    addLabel: 'TLD',
    normalize: normalizeTld,
    on: () => state.settings?.tldBlock,
    kicker: 'TLD blocking is switched off in Settings.',
  },
  {
    id: 'keywords',
    key: 'keyword',
    title: 'Blocked keywords',
    hint: 'Stops a query when any label contains this text.',
    invalid: 'Lowercase letters, digits, dots and dashes only, at least 4 characters.',
    placeholder: 'doubleclick',
    empty: 'Add a fragment like “doubleclick” to start stopping queries.',
    addLabel: 'keyword',
    normalize: normalizeKeyword,
    on: () => state.settings?.keywordBlock,
    kicker: 'Keyword blocking is switched off in Settings.',
  },
  {
    id: 'regex',
    key: 'regex',
    title: 'Regex rules',
    hint: 'Stops any query whose name matches the pattern (matched against the full lowercase name).',
    invalid: 'A compileable pattern, 4–128 characters, no whitespace.',
    placeholder: 'cdn\\d+\\.example\\.com',
    empty: 'Add a pattern like “cdn\\d+\\.example\\.com” to start stopping queries.',
    addLabel: 'regex',
    normalize: normalizeRegex,
    on: () => state.settings?.regexBlock,
  },
];

const draft = ref({ tld: '', keyword: '', regex: '' });
const blDraft = ref('');
const blProblem = computed(() => {
  const v = blDraft.value.trim();
  if (!v) return '';
  if (!isHttpsUrl(v)) return t('Needs an https:// URL — the worker fetches the list over https.');
  if (subs.value.some((s) => s.url === v)) return t('That blocklist is already subscribed.');
  return '';
});

const items = (id) => (id === 'tlds' ? state.tlds : id === 'regex' ? state.regex : state.keywords);
const typed = (form) => draft.value[form.key].trim();
// Same normalizer the API validates with, so a valid entry is always submittable.
const stored = (form) => form.normalize(typed(form));
const problem = (form) => (typed(form) && !stored(form) ? form.invalid : '');

async function add(form) {
  const value = stored(form);
  if (!value) return;
  try {
    await runOp(`lists.${form.key}.add`, {
      verb: t('Add {x}').replace('{x}', form.addLabel),
      ok: (r) => (r.added ? t('{d} added').replace('{d}', value) : t('{d} was already on the list').replace('{d}', value)),
      undo: async () => {
        await api.removeItem(form.id, value);
        await loadLists();
      },
      fn: async () => {
        const r = await api.addItem(form.id, value);
        await loadLists();
        return r;
      },
    });
    draft.value[form.key] = ''; // kept for fixing when the worker refuses
  } catch { /* the alert stack carries the reason */ }
}

async function remove(form, value) {
  await runOp(`lists.${form.key}.del:${value}`, {
    verb: t('Remove from list'),
    ok: `${value} ${t('removed')}`,
    undo: async () => {
      await api.addItem(form.id, value);
      await loadLists();
    },
    fn: async () => {
      await api.removeItem(form.id, value);
      await loadLists();
      return value;
    },
  }).catch(() => {});
}

// ---- blocklist subscriptions

const blocklist = computed(() => state.blocklist);
const subs = computed(() => blocklist.value?.subscriptions ?? []);
const blTotal = computed(() => blocklist.value?.total ?? 0);
const blMax = computed(() => blocklist.value?.maxUrls ?? MAX_BLOCKLIST_URLS);
const blLimit = computed(() => blocklist.value?.entryLimit ?? BLOCKLIST_ENTRY_LIMIT);
const atMax = computed(() => subs.value.length >= blMax.value);
const overLimit = computed(() => blTotal.value > blLimit.value);

const currentPreset = computed(() => blocklist.value?.preset || '');
const categories = computed(() => blocklist.value?.categories || { nsfw: false, social: false, gambling: false });
const isCustomMode = computed(() => currentPreset.value === '' && Array.isArray(blocklist.value?.subscriptions));
const customSubs = computed(() => {
  if (!isCustomMode.value) return [];
    // In custom mode, all subs are treated as custom unless we track them separately.
  // For simplicity in this UI refactor, if preset is '', all shown subs are custom.
  return subs.value.filter(s => s.source !== 'deploy'); 
});

async function selectPreset(p) {
  await runOp('lists.blocklist.preset', {
    verb: t('Select main list'),
    ok: () => t('Main list set to {p}').replace('{p}', p),
    fn: async () => {
      await api.saveSettings({ blocklistPreset: p, blocklistUrls: null });
      await loadBlocklists();
    },
  }).catch(() => {});
}

async function switchToCustom() {
  await runOp('lists.blocklist.custom', {
    verb: t('Switch to custom'),
    ok: () => t('Custom mode enabled'),
    fn: async () => {
      // Clear preset, keep existing URLs as custom base if any, or start empty
      await api.saveSettings({ blocklistPreset: '', blocklistUrls: [] });
      await loadBlocklists();
    },
  }).catch(() => {});
}

async function toggleCategory(cat, val) {
  const key = `blocklist${cat.charAt(0).toUpperCase() + cat.slice(1)}`;
  await runOp(`lists.blocklist.cat.${cat}`, {
    verb: `${val ? t('Enable') : t('Disable')} ${cat.toUpperCase()}`,
    ok: () => `${cat.toUpperCase()} ${val ? t('enabled') : t('disabled')}`,
    fn: async () => {
      await api.saveSettings({ [key]: val });
      await loadBlocklists();
    },
  }).catch(() => {});
}

const blCanAdd = computed(() => isHttpsUrl(blDraft.value.trim()) && !blProblem.value && !atMax.value);









/** Escape hatch for a deployment whose own configuration broke it: the reset
 *  route lives beside /healthz and needs only the dashboard password, so it
 *  works even when /api/* no longer answers. */
async function resetWorker() {
  const pw = window.prompt(
    t('Wipes settings, routes and custom rules on the worker.') + '\n' + t('Deployment variables and the query log stay.') + '\n\n' + t('Dashboard password:')
  );
  if (pw === null) return;
  await runOp('lists.resetWorker', {
    verb: t('Reset worker'),
    ok: t('Worker reset — settings and custom rules cleared'),
    fn: async () => {
      const r = await api.resetWorker(pw);
      await boot();
      return r;
    },
  }).catch(() => {});
}

</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-[21px] font-semibold tracking-tight">{{ t('Filter lists') }}</h1>
      <p class="hint mt-1">{{ t('Remote blocklist subscriptions and three plain lists that decide on their own.') }}</p>
    </div>

    <!-- Blocklist subscriptions: presets, switches, custom -->
    <section class="panel overflow-hidden">
      <div class="px-5 py-4 border-b border-line flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-[15px] font-medium">{{ t('Blocklist subscriptions') }}</h2>
        <span class="st text-[12.5px] text-muted">
          {{ subs.length }}/{{ blMax }} {{ t('listed') }}
          <template v-if="blocklist?.totalExceptions">
            · {{ blocklist.totalExceptions.toLocaleString() }} exceptions
          </template>
        </span>
        <AppButton
          v-if="subs.length"
          small
          busy-key="lists.blocklist.reload"
          class="ml-auto"
          @click="reloadBlocklists"
        >
          {{ t('Update now') }}
        </AppButton>
      </div>

      <div class="px-5 py-4 space-y-4">
        <!-- Main List Selector -->
        <fieldset class="border-0 p-0 m-0">
          <legend class="sr-only">{{ t('Main list') }}</legend>
          <div class="flex flex-wrap gap-2">
            <label
              v-for="p in ['light', 'pro', 'pro-plus', 'ultimate']"
              :key="p"
              class="inline-flex items-center gap-2 px-3 h-9 rounded-md border cursor-pointer select-none transition-colors"
              :class="[
                currentPreset === p ? 'border-beacon bg-beacon/10 text-ink' : 'border-line text-muted hover:border-muted/60',
                state.ops['lists.blocklist.preset'] && 'pointer-events-none opacity-70'
              ]"
            >
              <input
                type="radio"
                name="mainList"
                :value="p"
                :checked="currentPreset === p"
                :disabled="state.ops['lists.blocklist.preset']"
                class="sr-only"
                @change="selectPreset(p)"
              />
              <span class="capitalize st text-[13px] font-medium">{{ p.replace('-', ' ') }}</span>
            </label>
            
            <label
              class="inline-flex items-center gap-2 px-3 h-9 rounded-md border cursor-pointer select-none transition-colors"
              :class="[
                currentPreset === '' && isCustomMode ? 'border-beacon bg-beacon/10 text-ink' : 'border-line text-muted hover:border-muted/60'
              ]"
            >
              <input
                type="radio"
                name="mainList"
                value=""
                :checked="currentPreset === '' && isCustomMode"
                :disabled="state.ops['lists.blocklist.preset'] || state.ops['lists.blocklist.custom']"
                class="sr-only"
                @change="switchToCustom()"
              />
              <span class="st text-[13px] font-medium">{{ t('Custom') }}</span>
            </label>
          </div>
        </fieldset>

        <!-- Custom URL Input (visible only when Custom is selected) -->
        <div v-show="currentPreset === '' && isCustomMode" class="pt-2 border-t border-line/70">
          <form class="flex flex-wrap items-center gap-2.5" @submit.prevent="addBlocklist">
            <input
              v-model="blDraft"
              @input="blDraft = $event.target.value"
              type="url"
              class="field flex-1 min-w-[220px] st"
              placeholder="https://raw.githubusercontent.com/…/domains"
              :aria-label="t('Blocklist URL to subscribe')"
              autocapitalize="none"
              spellcheck="false"
              :aria-invalid="Boolean(blProblem)"
            />
            <AppButton
              variant="solid"
              type="submit"
              busy-key="lists.blocklist.add"
              :disabled="!blCanAdd"
            >
              {{ t('Add') }}
            </AppButton>
          </form>
          <p class="hint mt-2.5" :class="blProblem && 'text-block'" aria-live="polite">
            {{ blProblem || t('Each subscription is fetched over https and merged in memory; the union answers every query.') }}
          </p>
          
          <!-- Existing Custom Subs -->
          <div v-if="customSubs.length" class="mt-4 divide-y divide-line/70">
            <div
              v-for="s in customSubs"
              :key="s.url"
              class="py-3 flex flex-wrap items-baseline gap-x-3 gap-y-1"
            >
              <div class="min-w-0 flex-1">
                <span class="st text-[13px] break-all" :title="s.url">{{ s.url }}</span>
              </div>
              <div class="flex items-baseline gap-3 text-[12.5px] text-muted st">
                <span>{{ s.entries.toLocaleString() }} {{ t('entries') }}</span>
                <span v-if="s.exceptions">· {{ s.exceptions.toLocaleString() }} {{ t('except.') }}</span>
                <span v-if="s.error" class="text-block" :title="s.error">· {{ s.error }}</span>
              </div>
              <ConfirmButton
                small
                :label="t('Remove')"
                :armed-label="t('Confirm?')"
                :busy-key="`lists.blocklist.del:${s.url}`"
                @confirm="removeBlocklist(s.url)"
              />
            </div>
          </div>
        </div>

        <!-- Additional Switches -->
        <fieldset class="border-0 p-0 m-0 pt-2 border-t border-line/70">
          <legend class="sr-only">{{ t('Additional filters') }}</legend>
          <div class="space-y-3">
            <ToggleSwitch
              :model-value="categories.nsfw"
              :label="t('NSFW')"
              :effect="t('Blocks adult content domains.')"
              :busy-key="'lists.blocklist.cat.nsfw'"
              @update:model-value="toggleCategory('nsfw', $event)"
            />
            <ToggleSwitch
              :model-value="categories.social"
              :label="t('Social Networks')"
              :effect="t('Blocks major social media platforms.')"
              :busy-key="'lists.blocklist.cat.social'"
              @update:model-value="toggleCategory('social', $event)"
            />
            <ToggleSwitch
              :model-value="categories.gambling"
              :label="t('Gambling')"
              :effect="t('Blocks gambling and betting sites.')"
              :busy-key="'lists.blocklist.cat.gambling'"
              @update:model-value="toggleCategory('gambling', $event)"
            />
          </div>
        </fieldset>
        
        <p v-if="!subs.length && !categories.nsfw && !categories.social && !categories.gambling" class="hint">
          {{ t('No remote blocklist — every query goes to the upstream unless a rule or filter stops it.') }}
        </p>
      </div>

      <div class="px-5 py-3 border-t border-line flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p class="hint st">
          {{ blTotal.toLocaleString() }} {{ t('entries held in memory') }}
        </p>
        <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p v-if="overLimit" class="st text-[12.5px] text-block" role="alert">
            {{ t('More than {n} entries — the free plan can run the isolate out of memory.').replace('{n}', blLimit.toLocaleString()) }}
          </p>
          <AppButton
            small
            busy-key="lists.resetWorker"
            :title="t('Wipe settings, routes and custom rules on the worker — the last resort when it can no longer answer the dashboard.')"
            @click="resetWorker"
          >
            {{ t('Reset worker') }}
          </AppButton>
        </div>
      </div>
    </section>

    </section>

    <section
      v-for="form in FORMS"
      :key="form.id"
      class="panel overflow-hidden"
    >
      <div class="px-5 py-4 border-b border-line flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 class="text-[15px] font-medium">{{ t(form.title) }}</h2>
        <span class="st text-[12.5px] text-muted">{{ items(form.id).length }} {{ t('listed') }}</span>
        <button
          v-if="!form.on()"
          type="button"
          class="ml-auto text-[13px] text-beacon underline underline-offset-2"
          @click="setRoute('settings')"
        >
          {{ t(form.kicker) }}
        </button>
      </div>

      <div class="px-5 py-4">
        <form class="flex flex-wrap items-center gap-2.5" @submit.prevent="add(form)">
          <!-- The plain @input mirror is deliberate: v-model's default handler
               ignores input events while an IME marks the text as composing
               (Gboard commits per word), so validity would not light up until
               blur or a non-letter keystroke ended the composition. -->
          <input
            v-model="draft[form.key]"
            @input="draft[form.key] = $event.target.value"
            type="text"
            class="field flex-1 min-w-[160px] st"
            :placeholder="form.placeholder"
            :aria-label="t('New entry for {x}').replace('{x}', t(form.title))"
            autocapitalize="none"
            spellcheck="false"
            :aria-invalid="Boolean(problem(form))"
          />
          <AppButton
            variant="solid"
            type="submit"
            :busy-key="`lists.${form.key}.add`"
            :disabled="!stored(form)"
          >
            {{ t('Add') }}
          </AppButton>
        </form>

        <p class="hint mt-2.5" :class="problem(form) && 'text-block'" aria-live="polite">
          {{ problem(form) || t(form.hint) }}
        </p>

        <div v-if="items(form.id).length" class="mt-4 flex flex-wrap gap-2">
          <button
            v-for="item in items(form.id)"
            :key="item"
            type="button"
            class="group inline-flex items-center gap-1.5 rounded border border-line bg-raised pl-2.5 pr-1.5 h-7 st text-[12.5px] hover:border-block/60 transition-colors focus-visible:outline-2 focus-visible:outline-beacon"
            :disabled="state.ops[`lists.${form.key}.del:${item}`]"
            :aria-label="t('Remove {v} from {x}').replace('{v}', item).replace('{x}', t(form.title))"
            @click="remove(form, item)"
          >
            <span v-if="state.ops[`lists.${form.key}.del:${item}`]" class="block w-2.5 h-2.5 rounded-full border-2 border-beacon border-t-transparent spin" aria-hidden="true" />
            {{ item }}
            <svg class="w-3 h-3 text-muted group-hover:text-block" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
            </svg>
          </button>
        </div>

        <p v-else class="hint mt-3">
          {{ t('Empty.') }} {{ t(form.empty) }}
        </p>
      </div>
    </section>
  </div>
</template>
