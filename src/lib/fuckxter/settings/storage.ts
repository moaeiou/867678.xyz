import {
  getS3Config,
  saveS3Config,
  testS3Connection,
  type S3Config,
} from "../auth";
import { setStatus } from "./shared";

export function mountStorageSettings(root: HTMLElement): void {
  const s3Form = root.querySelector<HTMLFormElement>("[data-role=s3-form]")!;
  const s3Status = s3Form.querySelector<HTMLElement>(".fk-form-status")!;

  const s3ConfigFromForm = (): S3Config => {
    const data = new FormData(s3Form);
    return {
      endpoint: String(data.get("endpoint") ?? "").trim(),
      region: String(data.get("region") ?? "").trim(),
      bucket: String(data.get("bucket") ?? "").trim(),
      accessKeyId: String(data.get("accessKeyId") ?? "").trim(),
      secretAccessKey: String(data.get("secretAccessKey") ?? ""),
      pathStyle: data.get("pathStyle") === "on",
    };
  };

  const fillS3Form = () => {
    const config = getS3Config();
    if (!config) return;
    for (const [key, value] of Object.entries(config)) {
      const field = s3Form.querySelector<HTMLInputElement>(`[name=${key}]`);
      if (!field) continue;
      if (field.type === "checkbox") field.checked = Boolean(value);
      else field.value = String(value);
    }
    setStatus(s3Status, "");
  };

  root
    .querySelector<HTMLButtonElement>("[data-role=s3-test]")!
    .addEventListener("click", async () => {
      const button = root.querySelector<HTMLButtonElement>(
        "[data-role=s3-test]",
      )!;
      button.disabled = true;
      setStatus(s3Status, "测试中…");
      try {
        setStatus(s3Status, await testS3Connection(s3ConfigFromForm()));
      } catch (error) {
        setStatus(
          s3Status,
          error instanceof Error ? error.message : "连接失败",
        );
      } finally {
        button.disabled = false;
      }
    });

  s3Form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = s3Form.querySelector<HTMLButtonElement>(".fk-primary-btn")!;
    button.disabled = true;
    try {
      await saveS3Config(s3ConfigFromForm());
      setStatus(s3Status, "已保存 ✓");
      setTimeout(() => setStatus(s3Status, ""), 1500);
    } catch (error) {
      setStatus(s3Status, error instanceof Error ? error.message : "保存失败");
    } finally {
      button.disabled = false;
    }
  });

  fillS3Form();
}
