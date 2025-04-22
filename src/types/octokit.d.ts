declare module "octokit" {
  export class Octokit {
    constructor(options?: { auth?: string });

    rest: {
      issues: {
        listMilestones(params: any): Promise<any>;
        create(params: any): Promise<any>;
        update(params: any): Promise<any>;
        get(params: any): Promise<any>;
        list(params: any): Promise<any>;
        listForRepo(params: any): Promise<any>;
        createMilestone(params: any): Promise<any>;
      };
      projects: {
        create(params: any): Promise<any>;
      };
      repos: {
        get(params: any): Promise<any>;
      };
    };

    graphql<T>(query: string, params?: Record<string, any>): Promise<T>;
  }
}
