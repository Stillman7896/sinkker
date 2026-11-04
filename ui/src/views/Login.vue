<script setup>
import { ref, computed, onMounted } from 'vue';
import { state, login, boot, runOp } from '../store.js';
import { ApiError } from '../api.js';
import { t } from '../i18n.js';
import AppButton from '../components/AppButton.vue';

const password = ref('');
const error = ref('');
const pw = ref(null);

const unconfigured = computed(() => state.phase === 'unconfigured');

onMounted(() => pw.value?.focus());

async function submit() {
  error.value = '';
  if (!password.value) {
    error.value = t('Enter the dashboard password.');
    return;
  }
  try {
    await runOp('auth.login', {
      verb: t('Sign in'),
      ok: t('Signed in'),
      fn: () => login(password.value),
    });
    password.value = '';
  } catch (e) {
    // 401 from the password itself vs 401 because the cookie never stuck.
    error.value = e.status === 401 && e.code !== 'no-cookie' ? t('That password did not match.') : e.message;
  }
}

/** boot() never rejects — it records its outcome in `state.phase` — so a plain
 *  runOp around it would report success while the page still says nothing is
 *  configured. Re-throw the phase as an ApiError so the toast cannot lie. */
async function recheck() {
  await runOp('auth.recheck', {
    verb: t('Check setup again'),
    ok: t('Configuration found — enter the password below'),
    fn: async () => {
      await boot();
      if (state.phase === 'unconfigured') {
        throw new ApiError('No dashboard password is configured on this worker.', 503, 'unconfigured');
      }
      if (state.phase === 'boot') throw new ApiError(state.bootError || 'The worker did not answer.');
      return state.phase;
    },
  }).catch(() => {});
}
</script>

<template>
  <div class="max-w-md mx-auto pt-8 sm:pt-16 rise-in">
    <div class="panel shadow-[var(--shadow-card)] p-6 sm:p-7">
      <template v-if="unconfigured">
        <h1 class="text-[19px] font-semibold tracking-tight">{{ t('No dashboard password yet') }}</h1>
        <p class="hint mt-2 leading-relaxed">
          The worker answers every dashboard request with
          <span class="st">503</span> until <span class="st">DASHBOARD_PASSWORD</span> is set.
          <span class="st">/healthz</span> reports
          <span class="st">dashboardConfigured</span>, and now also why it is degraded.
        </p>

        <div class="mt-4 rounded-md border border-line bg-raised px-3 py-2.5 st text-[12.5px] leading-relaxed overflow-x-auto">
          <span class="text-muted"># recommended — stays out of the repo, no redeploy</span><br />
          <span class="text-beacon">wrangler secret put DASHBOARD_PASSWORD</span><br /><br />
          <span class="text-muted"># or in wrangler.toml [vars] — then run npm run deploy</span><br />
          <span class="text-beacon">DASHBOARD_PASSWORD</span> = "choose-a-secret"
        </div>

        <AppButton
          variant="solid"
          block
          class="mt-5"
          busy-key="auth.recheck"
          @click="recheck"
        >
          {{ t('Check again') }}
        </AppButton>

        <p class="hint mt-3">
          Optional — without it only the DNS resolver and <span class="st">/healthz</span> stay
          available; every <span class="st">/api/*</span> call answers <span class="st">503</span>.
        </p>
      </template>

      <template v-else>
        <h1 class="text-[19px] font-semibold tracking-tight">{{ t('Sign in') }}</h1>
        <p class="hint mt-1.5">
          {{ state.signingOut ? t('Signed out. Enter the password to get back in.') : t('Dashboard password for this resolver.') }}
        </p>

        <form class="mt-5" @submit.prevent="submit">
          <label class="label" for="pw">{{ t('Dashboard password') }}</label>
          <input
            id="pw"
            ref="pw"
            v-model="password"
            type="password"
            autocomplete="current-password"
            class="field w-full mt-1.5"
            placeholder="••••••••"
            :aria-invalid="Boolean(error)"
            :aria-describedby="error ? 'pw-error' : undefined"
            @input="error = ''"
          />
          <p v-if="error" id="pw-error" class="text-[13px] text-block mt-2" role="alert">{{ error }}</p>

          <AppButton variant="solid" block type="submit" class="mt-4" busy-key="auth.login">
            {{ t('Sign in') }}
          </AppButton>
        </form>

        <p class="hint mt-4">
          Session cookie lasts 24 hours; it is <span class="st">HttpOnly</span> and read nowhere else.
        </p>
      </template>
    </div>
  </div>
</template>