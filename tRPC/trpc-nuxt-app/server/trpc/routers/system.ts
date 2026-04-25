import { z } from 'zod'
import { publicProcedure, router } from '../trpc'

// Nitro/Nuxt 4의 server tsconfig는 cross-runtime 설계 때문에
// `types: ["node"]`를 포함하지 않음 (Node 전역 사용 시 TS 오류).
// → process.uptime() 대신 모듈 스코프에 부팅 시각을 기록해 직접 계산.
const serverStartedAt = Date.now()

// system 도메인 — 서버 상태/메타 정보 관련 procedure를 모음.
export const systemRouter = router({
  hello: publicProcedure
    .input(
      z
        .object({
          name: z.string().min(1),
        })
        .optional(),
    )
    .query(({ input }) => ({
      greeting: `Hello, ${input?.name ?? 'world'}!`,
      timestamp: new Date().toISOString(),
    })),

  // 입력이 없는 procedure — .input() 호출 자체를 생략 가능
  serverInfo: publicProcedure.query(() => ({
    startedAt: new Date(serverStartedAt).toISOString(),
    uptimeSeconds: Math.round((Date.now() - serverStartedAt) / 1000),
  })),
})
