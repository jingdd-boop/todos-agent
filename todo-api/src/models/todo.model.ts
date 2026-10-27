// 先使用内存数组来模拟数据库
import { Todo } from "../types/todo";

// 定义一个内存数组来存储 Todo 对象
export const todos: Todo[] = [
  {
    id: 1,
    title: "学习 Node.js",
    completed: false,
    version: 0,
    userId: 1,
  },
  {
    id: 2,
    title: "学习 TypeScript",
    completed: true,
    version: 0,
    userId: 1,
  },
];
