// 定义Todo接口 用于定义Todo对象的结构
export interface Todo {
  id: number;
  title: string;
  completed: boolean;
  version: number;
  userId: number;
}

// 定义CreateTodoDTO接口 用于定义创建Todo对象的结构
// 代表创建 Todo 时，前端传给后端的数据
// {
//  "title": "学习 Node.js"
// }
export interface CreateTodoDTO {
  title: string;
  userId: number;
}

// 定义UpdateTodoDTO接口 用于定义更新Todo对象的结构
export interface UpdateTodoDTO {
  title?: string | undefined;
  completed?: boolean | undefined;
  version: number;
}

export interface TodoQuery {
  page: number;
  pageSize: number;
  completed?: boolean;
  userId?: number;
  sort?: "id" | "createdAt" | "title" | "completed";
  order?: "asc" | "desc";
}
