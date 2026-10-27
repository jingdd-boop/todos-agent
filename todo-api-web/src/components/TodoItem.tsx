import type { Todo } from '../types/todo'

export function TodoItem({
  todo,
  onToggle,
  onDelete,
}: {
  todo: Todo
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <article className={todo.completed ? 'todo done' : 'todo'}>
      <button className="check" onClick={onToggle}>
        {todo.completed ? '✓' : ''}
      </button>
      <div>
        <strong>{todo.title}</strong>
        <small>
          #{todo.id} · {new Date(todo.createdAt).toLocaleString()}
        </small>
      </div>
      <button className="delete" onClick={onDelete}>
        删除
      </button>
    </article>
  )
}
