import { createTRPCNuxtClient, httpBatchLink } from 'trpc-nuxt/client'
import type { AppRouter } from '~~/server/trpc/routers'

// 앱 전역에서 useNuxtApp().$trpc 로 접근 가능한 클라이언트.
// 서버 라우터의 *타입*만 참조하므로 실제 구현 코드는 클라이언트 번들에 포함되지 않음.
export default defineNuxtPlugin(() => {
  const client = createTRPCNuxtClient<AppRouter>({
    links: [
      httpBatchLink({
        url: '/api/trpc',
        // SSR 단계에서 incoming request의 cookie 헤더를 그대로 server route에 전달.
        // (CSR 단계에선 브라우저가 same-origin 쿠키를 자동 첨부하므로 별도 처리 불필요)
        pickHeaders: ['cookie'],
      }),
    ],
  })

  return {
    provide: {
      trpc: client,
    },
  }
})
