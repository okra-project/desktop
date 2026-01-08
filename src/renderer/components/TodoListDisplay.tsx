import React, { useState } from 'react';
import { TodoItem } from './utils/todoDetection';

interface TodoListDisplayProps {
  todos: TodoItem[];
}

function TodoListDisplay({ todos }: TodoListDisplayProps) {
  const [crossedOffItems, setCrossedOffItems] = useState<Set<string>>(new Set());

  const toggleCrossOff = (todoId: string) => {
    setCrossedOffItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(todoId)) {
        newSet.delete(todoId);
      } else {
        newSet.add(todoId);
      }
      return newSet;
    });
  };

  const getStatusIcon = (status: TodoItem['status']) => {
    switch (status) {
      case 'completed':
        return '✅';
      case 'in_progress':
        return '🔍';
      case 'pending':
        return '⏳';
      default:
        return '○';
    }
  };

  const getPriorityColor = (priority: TodoItem['priority']) => {
    switch (priority) {
      case 'high':
        return 'text-okra-orange border-okra-orange';
      case 'medium':
        return 'text-okra-yellow-hover border-okra-yellow';
      case 'low':
        return 'text-ink border-sage';
      default:
        return 'text-sidebar-text border-sidebar-border';
    }
  };

  if (todos.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 p-3 bg-sidebar-bg border border-sidebar-border rounded-lg">
      <h3 className="text-xs font-semibold text-ink mb-2 flex items-center">
        📝 Todo List ({todos.length} items)
      </h3>
      <div className="space-y-1">
        {todos.map((todo) => {
          const isCrossedOff = crossedOffItems.has(todo.id);
          const isCompleted = todo.status === 'completed';
          
          return (
            <div
              key={todo.id}
              className={`flex items-start gap-1.5 p-1.5 bg-white rounded border ${getPriorityColor(todo.priority)} transition-all duration-200 ${
                isCrossedOff ? 'opacity-50' : ''
              }`}
            >
              <button
                onClick={() => toggleCrossOff(todo.id)}
                className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-xs hover:bg-sidebar-bg-hover rounded border border-sidebar-border transition-colors"
                title={isCrossedOff ? 'Uncheck item' : 'Cross off item'}
              >
                {isCrossedOff ? '❌' : '☐'}
              </button>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-xs">{getStatusIcon(todo.status)}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${getPriorityColor(todo.priority)} bg-opacity-20`}>
                    {todo.priority}
                  </span>
                  {isCompleted && (
                    <span className="text-xs text-sidebar-text italic">
                      (completed)
                    </span>
                  )}
                </div>
                <p
                  className={`text-xs text-ink ${
                    isCrossedOff || isCompleted ? 'line-through' : ''
                  }`}
                >
                  {todo.content}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="mt-2 pt-2 border-t border-sidebar-border">
        <div className="flex justify-between text-xs text-sidebar-text">
          <span>
            Completed: {todos.filter(t => t.status === 'completed').length}
          </span>
          <span>
            In Progress: {todos.filter(t => t.status === 'in_progress').length}
          </span>
          <span>
            Pending: {todos.filter(t => t.status === 'pending').length}
          </span>
        </div>
      </div>
    </div>
  );
}

export default TodoListDisplay;