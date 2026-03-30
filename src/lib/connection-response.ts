export interface NormalizedConnectionInfo {
  domainName: string;
  forest: string;
  infrastructureMaster: string;
  connectedAs: string;
  resolvedServer: string;
}

function asObject(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }

  if (typeof payload === "string") {
    const raw = payload.trim();
    if (!raw) {
      throw new Error("Connection response from backend was empty.");
    }

    const candidates = buildJsonCandidates(raw);
    for (const candidate of candidates) {
      try {
        return asObject(JSON.parse(candidate));
      } catch {
        // Try next candidate.
      }
    }

    const sample = candidates[0]
      ? candidates[0].slice(0, 220)
      : raw.slice(0, 220);
    throw new Error(
      `Connection response from backend was not valid JSON. Raw output: ${sample}`
    );
  }

  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      throw new Error("Connection response from backend was empty.");
    }
    return asObject(payload[0]);
  }

  throw new Error("Connection response from backend was invalid.");
}

function buildJsonCandidates(raw: string): string[] {
  const cleaned = raw
    .replace(/\u0000/g, "")
    .replace(/\x1b\[[0-9;]*m/g, "")
    .trim();

  const out: string[] = [];
  const seen = new Set<string>();
  const add = (value: string) => {
    const v = value.trim();
    if (!v || seen.has(v)) {
      return;
    }
    seen.add(v);
    out.push(v);
  };

  add(cleaned);

  const firstObj = cleaned.indexOf("{");
  const lastObj = cleaned.lastIndexOf("}");
  if (firstObj >= 0 && lastObj > firstObj) {
    add(cleaned.slice(firstObj, lastObj + 1));
  }

  const firstArr = cleaned.indexOf("[");
  const lastArr = cleaned.lastIndexOf("]");
  if (firstArr >= 0 && lastArr > firstArr) {
    add(cleaned.slice(firstArr, lastArr + 1));
  }

  const lines = cleaned.split(/\r?\n/).map((line) => line.trim());
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!line) {
      continue;
    }
    if (
      (line.startsWith("{") && line.endsWith("}")) ||
      (line.startsWith("[") && line.endsWith("]")) ||
      (line.startsWith("\"") && line.endsWith("\""))
    ) {
      add(line);
    }
  }

  return out;
}

function firstString(
  data: Record<string, unknown>,
  keys: string[]
): string {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

export function normalizeConnectionPayload(
  payload: unknown,
  serverOverride?: string
): NormalizedConnectionInfo {
  const data = asObject(payload);
  const override = serverOverride?.trim() ?? "";

  const infrastructureMaster = firstString(data, [
    "InfrastructureMaster",
    "infrastructureMaster",
    "infrastructure_master",
  ]);
  const resolvedServer =
    firstString(data, [
      "DomainController",
      "domainController",
      "domain_controller",
      "domaincontroller",
    ]) ||
    infrastructureMaster ||
    override;

  if (!resolvedServer) {
    throw new Error(
      "Could not determine a domain controller from the connection response."
    );
  }

  const dnsRoot = firstString(data, ["DNSRoot", "dnsRoot", "dns_root"]);
  const domainName = firstString(data, ["Name", "name"]) || dnsRoot;

  return {
    domainName,
    forest: firstString(data, ["Forest", "forest"]),
    infrastructureMaster,
    connectedAs: firstString(data, [
      "ConnectedAs",
      "connectedAs",
      "connected_as",
    ]),
    resolvedServer,
  };
}
