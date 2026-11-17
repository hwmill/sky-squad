// API 테스트 설정 (Cloudflare 공식 Vitest 연동, 2026-11-17 문서 기준)
// 실제 Workers 런타임(workerd) 안에서 wrangler.jsonc 그대로 실행된다.
import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-plugin';

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
});
