import {
  PollResponseSchema,
  RegisterResponseSchema,
  type PollResponse,
  type RegisterResponse,
  type TaskApi,
} from "@alook/shared";

export class DaemonClient {
  constructor(
    private baseURL: string,
    private token: string,
  ) {}

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.token}`,
    };
    const res = await fetch(this.baseURL + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    if (res.status === 204) return undefined as T;
    return res.json();
  }

  async register(body: {
    workspace_id: string;
    daemon_id: string;
    device_name: string;
    cli_version: string;
    runtimes: {
      name: string;
      type: string;
      version: string;
      status: string;
    }[];
  }): Promise<RegisterResponse> {
    const raw = await this.request<unknown>(
      "POST",
      "/api/daemon/register",
      body,
    );
    return RegisterResponseSchema.parse(raw);
  }

  deregister(runtimeIds: string[]) {
    return this.request("POST", "/api/daemon/deregister", {
      runtime_ids: runtimeIds,
    });
  }

  async poll(runtimeIds: string[], maxTasks: number): Promise<TaskApi[]> {
    const raw = await this.request<unknown>(
      "POST",
      "/api/daemon/tasks/poll",
      { runtime_ids: runtimeIds, max_tasks: maxTasks },
    );
    const resp: PollResponse = PollResponseSchema.parse(raw);
    return resp.tasks;
  }

  startTask(taskId: string) {
    return this.request("POST", `/api/daemon/tasks/${taskId}/start`);
  }

  completeTask(
    taskId: string,
    body: {
      output: string;
      session_id?: string;
      branch_name?: string;
    },
  ) {
    return this.request(
      "POST",
      `/api/daemon/tasks/${taskId}/complete`,
      body,
    );
  }

  failTask(taskId: string, error: string) {
    return this.request("POST", `/api/daemon/tasks/${taskId}/fail`, {
      error,
    });
  }

  reportMessages(
    taskId: string,
    messages: {
      seq: number;
      type: string;
      tool?: string;
      call_id?: string;
      content?: string;
      input?: Record<string, unknown>;
      output?: string;
    }[],
  ) {
    return this.request(
      "POST",
      `/api/daemon/tasks/${taskId}/messages`,
      { messages },
    );
  }
}
