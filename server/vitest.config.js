// API 테스트 설정 (Cloudflare 공식 Vitest 연동, 2026-11-17 문서 기준)
// 실제 Workers 런타임(workerd) 안에서 wrangler.jsonc 그대로 실행된다.
// 끊김 대기 시간(실제 15초·30초)은 테스트에서만 짧게 바꾼다.
import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-plugin';

export default defineConfig({
  plugins: [cloudflareTest({
    wrangler: { configPath: './wrangler.jsonc' },
    miniflare: { bindings: { GUEST_HOLD_MS: '400', HOST_HOLD_MS: '600' } },
  })],
});
