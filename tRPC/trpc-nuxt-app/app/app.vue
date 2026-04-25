<script setup lang="ts">
import type { TRPCClientErrorLike } from '@trpc/client'
import { getQueryKey } from 'trpc-nuxt/client'
import { computed, ref } from 'vue'
import type { AppRouter } from '~~/server/trpc/routers'

const { $trpc } = useNuxtApp()

// --- 인증 (04) ---
const userIdCookie = useCookie<string | null>('demo-user-id', {
  default: () => null,
  sameSite: 'lax',
})
const isLoggedIn = computed(() => !!userIdCookie.value)

async function login(id: string) {
  userIdCookie.value = id
  await refreshList()
}
function logout() {
  userIdCookie.value = null
}

// --- 데이터 ---
const { data: todos } = await $trpc.todo.list.useQuery()

// 정교한 invalidation — useQuery가 내부적으로 useAsyncData에 박아둔 key를
// getQueryKey로 얻어, refreshNuxtData로 같은 key의 모든 인스턴스를 한 번에 갱신.
// (현재 페이지엔 list useQuery가 하나뿐이지만, 다른 컴포넌트가 같은 query를
// 호출해도 함께 새로고침되는 패턴이라는 점이 중요)
const todoListKey = getQueryKey($trpc.todo.list)
const refreshList = () => refreshNuxtData(todoListKey)

// 비핵심 메타정보 — server: false로 SSR을 아예 건너뛰고, CSR에서만 fetch.
// 결과: SSR HTML에는 "로딩 중..." 자리표시자 → hydrate 후 클라이언트가 채움.
//
// 📌 lazy: true 단독으로는 부족하다. lazy는 "이 query 때문에 navigation을
// 막지 않는다"는 뜻일 뿐, SSR에서 fetch 자체는 여전히 일어나 prerender 된다.
// 진짜 CSR-only 동작은 server: false가 필요.
const { data: serverInfo } = await $trpc.system.serverInfo.useQuery(
  undefined,
  { lazy: true, server: false },
)

const { mutate: addTodo, status: addStatus, error: addError } = $trpc.todo.add.useMutation()
const { mutate: toggleTodo, error: toggleError } = $trpc.todo.toggle.useMutation()
const { mutate: removeTodo, error: removeError } = $trpc.todo.remove.useMutation()

const newText = ref('')

async function onSubmit() {
  await addTodo({ text: newText.value })
  if (!addError.value) {
    newText.value = ''
    await refreshList()
  }
}

async function onToggle(id: string) {
  await toggleTodo({ id })
  await refreshList()
}

async function onRemove(id: string) {
  await removeTodo({ id })
  await refreshList()
}

// --- 에러 분기 (05) ---
type AppError = TRPCClientErrorLike<AppRouter>

function explainError(err: AppError | null): string | null {
  if (!err) return null
  switch (err.data?.code) {
    case 'UNAUTHORIZED': return '로그인 후 다시 시도해주세요.'
    case 'FORBIDDEN':    return '권한이 없습니다.'
    case 'NOT_FOUND':    return '항목을 찾을 수 없습니다. 새로고침 후 다시 시도해주세요.'
    case 'BAD_REQUEST':  return '입력값을 확인해주세요.'
    default:             return err.message
  }
}

const lastError = computed<AppError | null>(
  () => addError.value ?? toggleError.value ?? removeError.value ?? null,
)
const addFieldErrors = computed(() => addError.value?.data?.zodFieldErrors ?? null)
</script>

<template>
  <div style="font-family: ui-sans-serif, system-ui; padding: 2rem; max-width: 720px;">
    <h1>tRPC + Nuxt — 06. SSR & 캐싱</h1>

    <section style="margin-bottom: 1rem; padding: 8px; background: #f5f5f5;">
      <strong>로그인 상태:</strong>
      <span v-if="isLoggedIn">{{ userIdCookie }} (로그인됨)</span>
      <span v-else style="color: #888;">익명</span>
      <div style="margin-top: 8px; display: flex; gap: 8px;">
        <button :disabled="isLoggedIn" @click="login('user-1')">user-1로 로그인</button>
        <button :disabled="isLoggedIn" @click="login('user-2')">user-2로 로그인</button>
        <button :disabled="!isLoggedIn" @click="logout">로그아웃</button>
      </div>
    </section>

    <section style="margin-bottom: 1rem; padding: 8px; background: #fafaff; font-size: 0.85rem;">
      <strong>서버 정보 (CSR-only useQuery):</strong>
      <span v-if="!serverInfo" style="color: #888;">로딩 중...</span>
      <span v-else>
        startedAt={{ serverInfo.startedAt }}, uptime={{ serverInfo.uptimeSeconds }}s
      </span>
    </section>

    <form
      style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 1rem;"
      @submit.prevent="onSubmit"
    >
      <div style="display: flex; gap: 8px;">
        <input
          v-model="newText"
          placeholder="할 일을 입력하고 Enter"
          style="flex: 1; padding: 6px;"
          :disabled="addStatus === 'pending'"
        />
        <button type="submit" :disabled="addStatus === 'pending'">추가</button>
      </div>
      <ul
        v-if="addFieldErrors?.text"
        style="margin: 0; padding-left: 1.2rem; color: crimson; font-size: 0.85rem;"
      >
        <li v-for="msg in addFieldErrors.text" :key="msg">{{ msg }}</li>
      </ul>
    </form>

    <p
      v-if="lastError && !addFieldErrors"
      style="color: crimson; padding: 8px; background: #fff0f0;"
    >
      [{{ lastError.data?.code ?? 'ERROR' }}] {{ explainError(lastError) }}
    </p>

    <ul style="list-style: none; padding: 0;">
      <li
        v-for="t in todos"
        :key="t.id"
        style="display: flex; align-items: center; gap: 8px; padding: 4px 0;"
      >
        <input type="checkbox" :checked="t.completed" @change="onToggle(t.id)" />
        <span :style="{ textDecoration: t.completed ? 'line-through' : 'none', flex: 1 }">
          {{ t.text }}
        </span>
        <small style="color: #888;">({{ t.ownerId }})</small>
        <button @click="onRemove(t.id)">삭제</button>
      </li>
    </ul>
  </div>
</template>
