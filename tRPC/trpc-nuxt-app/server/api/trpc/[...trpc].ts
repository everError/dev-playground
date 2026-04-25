import { createTRPCNuxtHandler } from 'trpc-nuxt/server'
import { appRouter } from '~~/server/trpc/routers'
import { createContext } from '~~/server/trpc/context'

// /api/trpc/* 로 들어오는 모든 요청을 tRPC 라우터로 전달
export default createTRPCNuxtHandler({
  router: appRouter,
  createContext,
})
