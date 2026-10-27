export type Todo = {
  id: number
  title: string
  completed: boolean
  createdAt: string
}

export type TodoResult = {
  data: Todo[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}
