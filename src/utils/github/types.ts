export interface Task {
  id: number;
  title: string;
  description: string;
  milestone: string;
  project: string;
  status: string;
  priority?: string; // Prioridade da tarefa: alta, média, baixa, etc.
  dependencies?: number[]; // IDs das tarefas que precisam ser concluídas antes
  synced?: boolean;
  github_issue_number?: number;
  lastSyncAt?: string; // Data e hora da última sincronização com GitHub
  state?: string; // Estado da issue no GitHub (open/closed)
  deleted?: boolean; // Indica se a task foi marcada como excluída
  comments?: TaskComment[]; // Comentários da tarefa
}

export interface TaskComment {
  text: string;
  date: string;
  author: string;
  type?: string; // Tipo de comentário (status-change, user, etc.)
}

export interface ProjectNode {
  id: string;
  title: string;
}

export interface ProjectsResponse {
  organization?: {
    projectsV2?: {
      nodes: ProjectNode[];
    };
  };
  user?: {
    projectsV2?: {
      nodes: ProjectNode[];
    };
  };
}

export interface ProjectQueryResponse {
  node: {
    id: string;
  };
}

export interface UserResponse {
  user: { id: string } | null;
}

export interface ProjectStatusResponse {
  node: {
    projectItems?: {
      nodes: Array<{
        fieldValues: {
          nodes: Array<{
            name?: string;
            field?: {
              name?: string;
            };
          }>;
        };
      }>;
    };
  };
}

export interface ProjectResponse {
  node: {
    projectItems?: {
      nodes: Array<{
        project: {
          title: string;
        };
      }>;
    };
    projectsV2?: {
      nodes: Array<{
        title: string;
      }>;
    };
  };
}

export interface ProjectFieldsResponse {
  node: {
    fields?: {
      nodes: Array<{
        name?: string;
        options?: Array<{
          name: string;
        }>;
      }>;
    };
  };
}
