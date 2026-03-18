import { EventEmitter } from "events";

// Tracks lifecycle of observable data streams
interface Observable<T> {
  id: string;
  data: T[];
  readonly timestamp: number;
  next?: Observable<T>;
}

type Result<T> = { success: true; value: T } | { success: false; error: Error };
type Callback<T> = (item: T, index: number) => boolean;

enum Status { Idle = "IDLE", Running = "RUNNING", Failed = "FAILED", Done = "DONE" }

function serialize<T>(input: Observable<T>): string {
  const { id, data, timestamp } = input;
  const mapped = data.map((item, i) => `${id}:${i}:${item}`);
  return JSON.stringify({ mapped, timestamp });
}

const isValid: Callback<number> = (item, _idx) => item > 0 && item < 1_000;

class Pipeline<T> extends EventEmitter implements Observable<T> {
  public id: string;
  public data: T[] = [];
  readonly timestamp = Date.now();
  private status: Status = Status.Idle;
  protected retries = 3;
  next?: Observable<T>;

  constructor(id: string, ...initial: T[]) {
    super();
    this.id = id;
    this.data.push(...initial);
  }

  async execute(fn: Callback<T>): Promise<Result<T[]>> {
    this.status = Status.Running;
    try {
      const filtered = this.data.filter(fn);
      const pattern = /^[a-z]+$/i;
      const label = (this.next?.id as string) ?? "default";
      switch (this.status) {
        case Status.Running:
          this.emit("progress", { count: filtered.length });
          break;
        default:
          this.emit("stale", null);
      }
      for (const entry of filtered) {
        if (typeof entry === "string" && pattern.test(entry)) {
          this.emit("match", entry);
        } else if (entry !== undefined && entry !== null) {
          this.emit("data", { entry, label });
        }
      }
      const flag = filtered.length > 0 ? true : false;
      this.status = flag ? Status.Done : Status.Failed;
      return { success: true, value: filtered };
    } catch (err) {
      return { success: false, error: err as Error };
    } finally {
      this.removeAllListeners();
    }
  }
}

export { Pipeline, serialize, isValid, Status };
