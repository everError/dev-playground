import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { protectedProcedure, publicProcedure, router } from '../trpc'

export interface Todo {
  id: string
  text: string
  completed: boolean
  createdAt: string
  ownerId: string  // 어떤 사용자가 만든 todo인지 — 04 단계에서 추가
}

const todos: Todo[] = [
  {
    id: 'seed-1',
    text: 'tRPC 셋업 완료하기',
    completed: true,
    createdAt: new Date().toISOString(),
    ownerId: 'user-1',
  },
  {
    id: 'seed-2',
    text: 'Todo CRUD 구현하기',
    completed: false,
    createdAt: new Date().toISOString(),
    ownerId: 'user-1',
  },
]

const todoIdInput = z.object({
  id: z.string().min(1),
})

const addTodoInput = z.object({
  text: z
    .string()
    .trim()
    .min(1, '내용을 입력해주세요.')
    .max(120, '120자 이하로 입력해주세요.')
    .refine(v => !/^\s*$/.test(v), '공백만으로는 작성할 수 없습니다.'),
})

export const todoRouter = router({
  // list는 누구나 조회 가능 (publicProcedure)
  list: publicProcedure.query((): Todo[] => {
    return [...todos].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1
      return b.createdAt.localeCompare(a.createdAt)
    })
  }),

  // 이하 mutation은 모두 로그인 필요 (protectedProcedure)
  // → ctx.user가 non-null로 narrow됨
  add: protectedProcedure
    .input(addTodoInput)
    .mutation(({ input, ctx }): Todo => {
      const todo: Todo = {
        id: crypto.randomUUID(),
        text: input.text,
        completed: false,
        createdAt: new Date().toISOString(),
        ownerId: ctx.user.id,
      }
      todos.push(todo)
      return todo
    }),

  toggle: protectedProcedure
    .input(todoIdInput)
    .mutation(({ input, ctx }): Todo => {
      const target = todos.find(t => t.id === input.id)
      if (!target) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `해당 id의 todo를 찾을 수 없습니다: ${input.id}`,
        })
      }
      // 소유자만 수정 가능
      if (target.ownerId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: '본인의 todo만 수정할 수 있습니다.',
        })
      }
      target.completed = !target.completed
      return target
    }),

  remove: protectedProcedure
    .input(todoIdInput)
    .mutation(({ input, ctx }): { id: string } => {
      const target = todos.find(t => t.id === input.id)
      if (!target) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `해당 id의 todo를 찾을 수 없습니다: ${input.id}`,
        })
      }
      if (target.ownerId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: '본인의 todo만 삭제할 수 있습니다.',
        })
      }
      todos.splice(todos.indexOf(target), 1)
      return { id: input.id }
    }),
})
