<script setup>
import { ref, computed } from 'vue';
import { state, runOp, loadRules, filteredRules } from '../store.js';
import { api } from '../api.js';
import AppButton from '../components/AppButton.vue';
import ConfirmButton from '../components/ConfirmButton.vue';
import Segmented from '../components/Segmented.vue';
import { normalizeDomain } from '../validate.js';
import { t } from '../i18n.js';

const domain = ref('');
const kind = ref('deny');
const view = ref('all'); // 'all' | 'deny' | 'allow'
const ruleFilter = ref('');
const bulkKind = ref('deny');
const bulkText = ref('');
const showBulk = ref(false);

// One segmented view per verdict; the text filter narrows within the view.
const visibleRules = computed(() =>
  view.value === 'all' ? filteredRules.value : filteredRules.value.filter((r) => r.kind === view.value),
);
const customCount = computed(() => state.rules.filter((r) => r.src !== 'blocklist').length);
const exceptionCount = computed(() => state.rules.length - customCount.value);
const viewTitle = computed(() =>
  view.value === 'deny' ? t('Block rules') : view.value === 'allow' ? t('Allow rules') : t('All rules'),
);

// What the worker will store for the typed value, or '' when it would reject
// it. Same function the API validates with, so the field can't disagree
// (URLs, wildcards and trailing dots are accepted; a bare word is not).
const normalized = computed(() => normalizeDomain(domain.value.trim()));
const invalid = computed(() => Boolean(domain.value.trim()) && !normalized.value);
const note = computed(() => {
  if (invalid.value) return t('Needs a real domain, like ads.example.net.');
  if (normalized.value && normalized.value !== domain.value.trim()) return t('Saves as {d}.').replace('{d}', normalized.value);
  return t('A rule applies to the domain and every subdomain of it. Allow wins over the blocklist.');
});

async function addRule() {
  const value = normalized.value;
  if (!value) return;
  try {
    await runOp('rules.add', {
      verb: t('Add rule'),
      ok: (r) => `${r.domain} ${r.kind === 'deny' ? t('now blocked') : t('now allowed')}`,
      undo: async (r) => {
        await api.deleteRule(r.domain);
        await loadRules();
      },
      fn: async () => {
        const r = await api.addRule(value, kind.value);
        await loadRules();
        return r;
      },
    });
    domain.value = ''; // keep the text so it can be fixed and resent on failure
  } catch { /* the alert stack carries the reason */ }
}

async function importBulk() {
  if (!bulkReady.value) return;
  const text = bulkText.value.trim();
  await runOp('rules.bulk', {
    verb: t('Import rules'),
    ok: (r) => (r.skipped.length
      ? t('{n} added, {m} left out').replace('{n}', r.added).replace('{m}', r.skipped.length)
      : t('{n} rules added').replace('{n}', r.added)),
    fn: async () => {
      const r = await api.bulkRules(bulkKind.value, text);
      await loadRules();
      if (!r.skipped.length) bulkText.value = '';
      return r;
    },
  }).catch(() => {});
}

// The worker splits on newlines/commas and drops whatever isn't a domain, so
// count the same way and say up front how many lines will actually land.
const bulkLines = computed(() => bulkText.value.split(/[\r\n,]+/).map((l) => l.trim()).filter(Boolean));
const bulkReady = computed(() => bulkLines.value.filter((l) => normalizeDomain(l)).length);

async function removeRule(r) {
  await runOp(`rules.del:${r.domain}`, {
    verb: t('Remove rule'),
    ok: () => `${r.domain} ${t('removed')}`,
    undo: async (res) => {
      await api.addRule(res.domain, res.kind);
      await loadRules();
    },
    fn: async () => {
      await api.deleteRule(r.domain);
      await loadRules();
      return { domain: r.domain, kind: r.kind };
    },
  }).catch(() => {});
}

function onFilter(e) {
  ruleFilter.value = e.target.value;
  state.ruleFilter = e.target.value;
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-[21px] font-semibold tracking-tight">{{ t('Rules') }}</h1>
        <p class="hint mt-1">
          Custom answers run before the shared blocklist. {{ customCount }}
          {{ customCount === 1 ? t('custom rule') : t('custom rules') }}<template v-if="exceptionCount">
          , {{ exceptionCount }} {{ exceptionCount === 1 ? t('allow exception') : t('allow exceptions') }} {{ t('from the blocklist') }}</template> on file.
        </p>
      </div>
      <AppButton @click="showBulk = !showBulk">
        {{ showBulk ? t('Close bulk import') : t('Bulk import') }}
      </AppButton>
    </div>

    <!-- Add one -->
    <section class="panel p-5">
      <h2 class="text-[15px] font-medium">{{ t('Add a rule') }}</h2>
      <form class="mt-3 flex flex-col gap-2.5" @submit.prevent="addRule">
        <div class="flex flex-wrap items-center gap-2.5">
          <input
            v-model="domain"
            @input="domain = $event.target.value"
            type="text"
            class="field flex-1 min-w-[180px] st"
            placeholder="ads.example.net"
            :aria-label="t('Domain')"
            autocapitalize="none"
            spellcheck="false"
            :aria-invalid="invalid"
            aria-describedby="rule-note"
          />
          <Segmented
            v-model="kind"
            :options="[
              { value: 'deny', label: t('Block') },
              { value: 'allow', label: t('Allow') },
            ]"
            :label="t('Answer')"
          />
        </div>
        <AppButton
          variant="solid"
          type="submit"
          busy-key="rules.add"
          :disabled="!normalized"
          class="w-full sm:w-auto sm:self-start"
        >
          {{ t('Add rule') }}
        </AppButton>
      </form>
      <p id="rule-note" class="hint mt-2.5" :class="invalid && 'text-block'" aria-live="polite">
        {{ note }}
      </p>
    </section>

    <!-- Bulk -->
    <section v-if="showBulk" class="panel p-5 rise-in">
      <h2 class="text-[15px] font-medium">{{ t('Paste many domains') }}</h2>
      <p class="hint mt-1">{{ t('One per line, or separated by commas.') }}</p>
      <textarea
        v-model="bulkText"
        @input="bulkText = $event.target.value"
        rows="7"
        class="area w-full mt-3"
        placeholder="ads.example.net&#10;beacon.partner.dev&#10;tracker.example.com"
        spellcheck="false"
        :aria-label="t('Domains to import')"
      />
      <div class="mt-3 flex flex-wrap items-center gap-2.5">
        <Segmented
          v-model="bulkKind"
          :options="[
            { value: 'deny', label: t('Block them') },
            { value: 'allow', label: t('Allow them') },
          ]"
          :label="t('Kind')"
        />
        <AppButton variant="solid" busy-key="rules.bulk" :disabled="!bulkReady" @click="importBulk">
          {{ t('Import') }}
        </AppButton>
        <span class="hint">
          {{ bulkReady }} / {{ bulkLines.length }} {{ t('lines ready') }}
          <template v-if="bulkLines.length && bulkReady < bulkLines.length">{{ t('— the rest are not domains') }}</template>
        </span>
      </div>
    </section>

    <!-- Rows: one row per rule, labels always visible -->
    <section class="panel overflow-hidden">
      <div class="flex flex-wrap items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-line">
        <h2 class="text-[15px] font-medium">{{ viewTitle }}</h2>
        <Segmented
          v-model="view"
          :options="[
            { value: 'all', label: t('All') },
            { value: 'deny', label: t('Block') },
            { value: 'allow', label: t('Allow') },
          ]"
          :label="t('View')"
        />
        <label class="ml-auto flex items-center gap-2">
          <span class="sr-only">{{ t('Filter rules') }}</span>
          <input
            type="text"
            class="field w-44 sm:w-56"
            :placeholder="t('Filter…')"
            :value="ruleFilter"
            @input="onFilter"
          />
        </label>
      </div>

      <div v-if="visibleRules.length" class="overflow-x-auto">
        <table class="w-full min-w-[420px] border-collapse text-left">
          <caption class="sr-only">{{ t('Custom allow and deny rules') }}</caption>
          <thead class="text-[12.5px] text-muted border-b border-line">
            <tr>
              <th scope="col" class="px-5 py-2 font-medium">{{ t('Domain') }}</th>
              <th scope="col" class="px-3 py-2 font-medium whitespace-nowrap">{{ t('Answer') }}</th>
              <th scope="col" class="px-3 py-2 font-medium whitespace-nowrap">{{ t('Source') }}</th>
              <th scope="col" class="px-5 py-2 font-medium text-right"><span class="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-line/70">
            <tr v-for="r in visibleRules" :key="r.domain" class="hover:bg-raised/60 transition-colors">
              <td class="px-5 py-3 w-full min-w-0">
                <span class="st text-[13.5px] truncate block" :title="r.domain">{{ r.domain }}</span>
              </td>
              <td class="px-3 py-3 whitespace-nowrap">
                <span
                  class="text-[12px] st rounded border px-2 py-0.5"
                  :class="r.kind === 'deny' ? 'text-block border-block/40' : 'text-pass border-pass/40'"
                >
                  {{ r.kind === 'deny' ? t('blocked') : t('allowed') }}
                </span>
              </td>
              <td class="px-3 py-3 whitespace-nowrap">
                <span
                  class="text-[12px] st rounded border px-2 py-0.5"
                  :class="r.src === 'blocklist' ? 'text-muted border-line' : 'text-ink border-line'"
                  :title="r.src === 'blocklist'
                    ? t('From the blocklist file (@@ exception) — edit the list, not this dashboard')
                    : t('Set in this dashboard')"
                >
                  {{ r.src === 'blocklist' ? t('blocklist') : t('custom') }}
                </span>
              </td>
              <td class="px-5 py-3 text-right whitespace-nowrap">
                <ConfirmButton
                  v-if="r.src !== 'blocklist'"
                  small
                  :label="t('Remove')"
                  :armed-label="t('Confirm?')"
                  :busy-key="`rules.del:${r.domain}`"
                  @confirm="removeRule(r)"
                />
                <span v-else class="hint text-[12px]">{{ t('read-only') }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="!visibleRules.length" class="px-5 py-10 text-center">
        <p class="text-[14px] font-medium">
          {{ ruleFilter
            ? t('No rule matches “{f}”.').replace('{f}', ruleFilter)
            : view === 'deny' ? t('No block rules yet.')
            : view === 'allow' ? t('No allow rules yet.')
            : t('No custom rules yet.') }}
        </p>
        <p class="hint mt-1.5">
          {{ ruleFilter
            ? t('Try part of the domain, without the top-level suffix.')
            : view === 'deny'
              ? t('Add a domain above to block it even when the shared list lets it through.')
              : view === 'allow'
                ? t('Allow rules force an answer. @@ exceptions in the blocklist file show up here too.')
                : t('Add a domain above to force an answer, or force-allow one the shared blocklist stops.') }}
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
</style>