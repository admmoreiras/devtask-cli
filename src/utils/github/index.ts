// Importações de submódulos
import assignees from "./assignees.js";
import auth from "./auth.js";
import issues from "./issues.js";
import milestones from "./milestones.js";
import projects from "./projects.js";
import tasks from "./tasks.js";

// Re-exportação de tipos
export * from "./types.js";

// Exportação de todos os módulos combinados
export default {
  ...auth,
  ...issues,
  ...milestones,
  ...projects,
  ...tasks,
  ...assignees,

  // Para compatibilidade com código existente
  listMilestones: milestones.listMilestones,
  listProjects: projects.listProjects,
  fetchMilestones: milestones.fetchMilestones,
  fetchProjects: projects.fetchProjects,
  createGitHubIssue: issues.createGitHubIssue,
  fetchGitHubIssues: issues.fetchGitHubIssues,
  updateTaskWithGitHubInfo: tasks.updateTaskWithGitHubInfo,
  fetchGitHubIssue: issues.fetchGitHubIssue,
  updateLocalTaskFromIssue: tasks.updateLocalTaskFromIssue,
  createLocalTaskFromIssue: tasks.createLocalTaskFromIssue,
  updateGitHubIssue: issues.updateGitHubIssue,
  fetchIssueProjectInfo: issues.fetchIssueProjectInfo,
  createMilestone: milestones.createMilestone,
  createProject: projects.createProject,
  fetchProjectStatusOptions: projects.fetchProjectStatusOptions,
  updateTaskMilestone: milestones.updateTaskMilestone,
  addAssigneeToIssue: assignees.addAssigneeToIssue,
  removeAssigneeFromIssue: assignees.removeAssigneeFromIssue,
  ensureOwnerAsAssignee: assignees.ensureOwnerAsAssignee,
};
