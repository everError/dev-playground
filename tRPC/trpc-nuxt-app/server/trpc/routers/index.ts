import { router } from '../trpc'
import { systemRouter } from './system'
import { todoRouter } from './todo'

// 최상위 라우터 — 도메인별 sub-router를 합침.
// 클라이언트에서는 $trpc.system.hello / $trpc.todo.list 형태로 호출됨.
export const appRouter = router({
  system: systemRouter,
  todo: todoRouter,
})

export type AppRouter = typeof appRouter
