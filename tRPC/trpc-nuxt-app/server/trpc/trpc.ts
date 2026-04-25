import { initTRPC, TRPCError } from '@trpc/server'
import { z } from 'zod'
import type { Context } from './context'

const t = initTRPC.context<Context>().create({
  // 에러 응답의 data 필드를 커스터마이즈.
  // - 기본 shape에 zodFieldErrors를 추가해, BAD_REQUEST가 Zod 검증 실패일 때
  //   클라이언트가 issue 배열을 파싱하지 않고 { 필드: [메시지...] } 형태로 바로 사용.
  // - 그 외 에러(UNAUTHORIZED 등)는 zodFieldErrors: null.
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // 캐스팅 이유: error.cause는 unknown이라 z.flattenError가 fieldErrors의
        // 키 모양을 추론하지 못하고 {} 로 떨어짐. 클라이언트에서 필드명으로
        // 인덱싱하려면 Record로 단언해 흐려진 타입을 살려준다.
        zodFieldErrors:
          error.code === 'BAD_REQUEST' && error.cause instanceof z.ZodError
            ? (z.flattenError(error.cause).fieldErrors as Record<string, string[] | undefined>)
            : null,
      },
    }
  },
})

export const router = t.router

// 모든 procedure 앞에 붙는 로깅 미들웨어 — path, type, durationMs 출력.
const loggerMiddleware = t.middleware(async ({ path, type, next }) => {
  const start = Date.now()
  const result = await next()
  const durationMs = Date.now() - start
  // eslint-disable-next-line no-console
  console.log(`[trpc] ${type} ${path} ${result.ok ? 'ok' : 'err'} (${durationMs}ms)`)
  return result
})

// 인증 미들웨어 — ctx.user가 null이면 즉시 UNAUTHORIZED.
// next({ ctx: { user } })로 ctx 모양을 narrow → 다음 단계에서는 user가 non-null로 추론됨.
const authedMiddleware = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: '로그인이 필요합니다.',
    })
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  })
})

// 누구나 호출 가능 — 로깅만 적용.
export const publicProcedure = t.procedure.use(loggerMiddleware)

// 인증 필요 — 로깅 → 인증 순으로 체이닝.
// 핸들러 안에서 ctx.user가 non-null로 자동 추론됨 (TS narrowing).
export const protectedProcedure = t.procedure.use(loggerMiddleware).use(authedMiddleware)
