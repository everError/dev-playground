import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch'
import { getCookie, type H3Event } from 'h3'

// 데모용 가짜 사용자 디렉터리.
// 실제 앱에선 DB / 세션 스토어를 조회하지만, 학습 목적이라 in-memory 매핑.
const fakeUsers: Record<string, { id: string, name: string }> = {
  'user-1': { id: 'user-1', name: '홍길동' },
  'user-2': { id: 'user-2', name: '김철수' },
}

// 클라이언트에서 useCookie('demo-user-id', { ... })로 set한 쿠키를 읽어
// 인증된 사용자를 결정. 없거나 알 수 없는 값이면 user = null (= 익명).
export async function createContext(event: H3Event, _opts: FetchCreateContextFnOptions) {
  const cookieValue = getCookie(event, 'demo-user-id')
  const user = cookieValue && fakeUsers[cookieValue] ? fakeUsers[cookieValue] : null

  return {
    event,
    user,
  }
}

export type Context = Awaited<ReturnType<typeof createContext>>
