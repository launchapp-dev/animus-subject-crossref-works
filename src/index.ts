import { definePlugin, PluginKind, type Subject, type SubjectBackend, type SubjectListParams, type SubjectStatus } from "@launchapp-dev/animus-plugin-sdk";

const NAME = "animus-subject-crossref-works";
const VERSION = "0.1.0";
const SUBJECT_KIND = "crossref.work";
const DEFAULT_API_URL = "https://api.crossref.org";

interface Config {
  apiUrl: string;
  query?: string;
  filter?: string;
  sort?: string;
  order?: string;
  select?: string;
  mailto?: string;
  localQuery?: string;
  limit: number;
}

interface CrossrefDate {
  "date-parts"?: number[][];
  "date-time"?: string;
  timestamp?: number;
}

interface CrossrefAuthor {
  given?: string;
  family?: string;
  name?: string;
  sequence?: string;
  ORCID?: string;
  affiliation?: Array<{ name?: string }>;
}

interface CrossrefLicense {
  URL?: string;
  start?: CrossrefDate;
  "delay-in-days"?: number;
  "content-version"?: string;
}

interface CrossrefLink {
  URL?: string;
  "content-type"?: string;
  "content-version"?: string;
  "intended-application"?: string;
}

interface CrossrefWork {
  DOI?: string;
  URL?: string;
  title?: string[];
  subtitle?: string[];
  type?: string;
  publisher?: string;
  "container-title"?: string[];
  subject?: string[];
  author?: CrossrefAuthor[];
  issued?: CrossrefDate;
  published?: CrossrefDate;
  "published-print"?: CrossrefDate;
  "published-online"?: CrossrefDate;
  created?: CrossrefDate;
  deposited?: CrossrefDate;
  indexed?: CrossrefDate;
  "is-referenced-by-count"?: number;
  score?: number;
  license?: CrossrefLicense[];
  link?: CrossrefLink[];
}

interface CrossrefListResponse {
  message?: {
    "total-results"?: number;
    items?: CrossrefWork[];
  };
}

interface CrossrefWorkResponse {
  message?: CrossrefWork;
}

function optionalEnv(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  return raw === "" ? undefined : raw;
}

function normalizeBaseUrl(raw: string | undefined, fallback: string): string {
  return (raw ?? fallback).replace(/\/+$/, "");
}

function readPositiveInt(raw: string | undefined, fallback: number, max: number): number {
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.min(value, max);
}

function readConfig(): Config {
  return {
    apiUrl: normalizeBaseUrl(optionalEnv("CROSSREF_API_URL"), DEFAULT_API_URL),
    query: optionalEnv("CROSSREF_QUERY"),
    filter: optionalEnv("CROSSREF_FILTER"),
    sort: optionalEnv("CROSSREF_SORT"),
    order: optionalEnv("CROSSREF_ORDER"),
    select: optionalEnv("CROSSREF_SELECT"),
    mailto: optionalEnv("CROSSREF_MAILTO"),
    localQuery: optionalEnv("CROSSREF_LOCAL_QUERY"),
    limit: readPositiveInt(optionalEnv("CROSSREF_LIMIT"), 50, 1000),
  };
}

function encodePart(value: string): string {
  return encodeURIComponent(value);
}

function decodePart(value: string): string {
  return decodeURIComponent(value);
}

function workDoi(work: CrossrefWork): string {
  return work.DOI ?? "unknown";
}

function workSubjectId(doi: string): string {
  return `${SUBJECT_KIND}:${encodePart(doi)}`;
}

function parseWorkSubjectId(id: string): string {
  const raw = id.startsWith(`${SUBJECT_KIND}:`) ? id.slice(`${SUBJECT_KIND}:`.length) : id;
  if (!raw) throw new Error(`expected id '${SUBJECT_KIND}:<doi>', got '${id}'`);
  return decodePart(raw);
}

function dateToIso(value: CrossrefDate | undefined): string | undefined {
  if (!value) return undefined;
  if (value["date-time"]) {
    const millis = Date.parse(value["date-time"]);
    return Number.isFinite(millis) ? new Date(millis).toISOString() : undefined;
  }
  if (typeof value.timestamp === "number") {
    return new Date(value.timestamp).toISOString();
  }
  const parts = value["date-parts"]?.[0];
  if (!parts || !parts[0]) return undefined;
  const [year, month = 1, day = 1] = parts;
  return new Date(Date.UTC(year, month - 1, day)).toISOString();
}

function titleFromWork(work: CrossrefWork): string {
  return work.title?.find(Boolean) ?? work.subtitle?.find(Boolean) ?? `Crossref work ${workDoi(work)}`;
}

function containerTitle(work: CrossrefWork): string | undefined {
  return work["container-title"]?.find(Boolean);
}

function authorName(author: CrossrefAuthor): string | undefined {
  if (author.name) return author.name;
  const parts = [author.given, author.family].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function firstAuthor(work: CrossrefWork): string | undefined {
  return work.author?.map(authorName).find(Boolean);
}

function nativeStatus(work: CrossrefWork): string {
  return work.type ?? "work";
}

function statusFromWork(_work: CrossrefWork): SubjectStatus {
  return "done";
}

function priorityFromWork(work: CrossrefWork): number {
  const references = work["is-referenced-by-count"] ?? 0;
  if (references >= 1000) return 0;
  if (references >= 100) return 1;
  if (references >= 10) return 2;
  return 3;
}

function labelsFromWork(config: Config, work: CrossrefWork): string[] {
  const labels = new Set<string>(["crossref", nativeStatus(work)]);
  if (config.query) labels.add(`query:${config.query}`);
  if (work.publisher) labels.add(`publisher:${work.publisher}`);
  const container = containerTitle(work);
  if (container) labels.add(`container:${container}`);
  for (const subject of work.subject?.slice(0, 5) ?? []) {
    labels.add(`subject:${subject}`);
  }
  const author = firstAuthor(work);
  if (author) labels.add(`author:${author}`);
  return [...labels];
}

function doiUrl(doi: string): string {
  return `https://doi.org/${doi}`;
}

function createdAtFromWork(work: CrossrefWork, fetchedAt: string): string {
  return (
    dateToIso(work.issued) ??
    dateToIso(work.published) ??
    dateToIso(work["published-online"]) ??
    dateToIso(work["published-print"]) ??
    dateToIso(work.created) ??
    fetchedAt
  );
}

function updatedAtFromWork(work: CrossrefWork, createdAt: string): string {
  return dateToIso(work.deposited) ?? dateToIso(work.indexed) ?? createdAt;
}

function subjectFromWork(config: Config, work: CrossrefWork, fetchedAt = new Date().toISOString()): Subject {
  const doi = workDoi(work);
  const createdAt = createdAtFromWork(work, fetchedAt);
  const updatedAt = updatedAtFromWork(work, createdAt);
  const container = containerTitle(work);
  return {
    id: workSubjectId(doi),
    kind: SUBJECT_KIND,
    title: titleFromWork(work),
    description: `${nativeStatus(work)} from Crossref${work.publisher ? ` by ${work.publisher}` : ""}${container ? ` in ${container}` : ""}`,
    status: statusFromWork(work),
    created_at: createdAt,
    updated_at: updatedAt,
    labels: labelsFromWork(config, work),
    assignee: firstAuthor(work),
    url: work.URL ?? (doi !== "unknown" ? doiUrl(doi) : undefined),
    native_status: nativeStatus(work),
    priority: priorityFromWork(work),
    custom: {
      doi,
      type: work.type,
      publisher: work.publisher,
      container_title: work["container-title"],
      subject: work.subject,
      authors: work.author,
      issued: work.issued,
      published: work.published,
      published_print: work["published-print"],
      published_online: work["published-online"],
      created: work.created,
      deposited: work.deposited,
      indexed: work.indexed,
      is_referenced_by_count: work["is-referenced-by-count"],
      score: work.score,
      license: work.license,
      link: work.link,
      raw: work,
    },
  };
}

function matchesConfiguredFilters(config: Config, work: CrossrefWork): boolean {
  if (!config.localQuery) return true;
  const needle = config.localQuery.toLowerCase();
  const haystack = [
    config.query,
    work.DOI,
    work.URL,
    ...(work.title ?? []),
    ...(work.subtitle ?? []),
    work.type,
    work.publisher,
    containerTitle(work),
    ...(work.subject ?? []),
    ...(work.author ?? []).map(authorName),
  ].join(" ").toLowerCase();
  return haystack.includes(needle);
}

function matchesFilters(config: Config, work: CrossrefWork, params: SubjectListParams): boolean {
  if (!matchesConfiguredFilters(config, work)) return false;
  const subject = subjectFromWork(config, work);
  if (params.status && params.status.length > 0 && !params.status.includes(subject.status)) return false;
  if (params.assignee && params.assignee.length > 0 && (!subject.assignee || !params.assignee.includes(subject.assignee))) return false;
  const labels = new Set(subject.labels ?? []);
  if (params.labels_all && !params.labels_all.every((label) => labels.has(label))) return false;
  if (params.labels_any && params.labels_any.length > 0 && !params.labels_any.some((label) => labels.has(label))) return false;
  if (params.updated_since && new Date(subject.updated_at) < new Date(params.updated_since)) return false;
  return true;
}

class CrossrefWorksClient {
  constructor(private readonly config: Config) {}

  async requestJson<T>(path: string, query: Record<string, string | number | undefined> = {}): Promise<T> {
    const url = new URL(`${this.config.apiUrl}${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    if (this.config.mailto) url.searchParams.set("mailto", this.config.mailto);
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": `${NAME}/${VERSION} (https://github.com/launchapp-dev/${NAME}${this.config.mailto ? `; mailto:${this.config.mailto}` : ""})`,
      },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Crossref API ${response.status} ${response.statusText}: ${text.slice(0, 500)}`);
    return JSON.parse(text) as T;
  }

  async list(): Promise<CrossrefWork[]> {
    const payload = await this.requestJson<CrossrefListResponse>("/works", {
      query: this.config.query,
      filter: this.config.filter,
      sort: this.config.sort,
      order: this.config.order,
      select: this.config.select,
      rows: this.config.limit,
    });
    return payload.message?.items ?? [];
  }

  async get(id: string): Promise<CrossrefWork> {
    const payload = await this.requestJson<CrossrefWorkResponse>(`/works/${encodeURIComponent(id)}`);
    if (!payload.message) throw new Error(`Crossref work not found: ${id}`);
    return payload.message;
  }
}

function buildBackend(): SubjectBackend {
  let cached: { client: CrossrefWorksClient; config: Config } | null = null;
  const runtime = (): { client: CrossrefWorksClient; config: Config } => {
    if (!cached) {
      const config = readConfig();
      cached = { client: new CrossrefWorksClient(config), config };
    }
    return cached;
  };
  return {
    async list(params) {
      const { client, config } = runtime();
      const works = await client.list();
      return {
        subjects: works.filter((work) => matchesFilters(config, work, params)).map((work) => subjectFromWork(config, work)),
        next_cursor: null,
        fetched_at: new Date().toISOString(),
      };
    },
    async get(params) {
      const { client, config } = runtime();
      return subjectFromWork(config, await client.get(parseWorkSubjectId(params.id)));
    },
    schema() {
      return {
        kinds: [SUBJECT_KIND],
        status_values: ["ready", "in-progress", "blocked", "done", "cancelled"],
        supports_watch: false,
        supports_create: false,
        supports_pagination: false,
        native_status_values: ["journal-article", "book-chapter", "book", "proceedings-article", "posted-content", "dataset", "report", "work"],
        status_dispatch_hints: [
          { native_status: "journal-article", status: "done" },
          { native_status: "book-chapter", status: "done" },
          { native_status: "work", status: "done" },
        ],
        custom_fields: ["doi", "type", "publisher", "container_title", "subject", "authors", "issued", "published", "published_print", "published_online", "created", "deposited", "indexed", "is_referenced_by_count", "score", "license", "link", "raw"],
      };
    },
    async health() {
      try {
        const { client } = runtime();
        await client.list();
        return { status: "healthy", uptime_ms: null, memory_usage_bytes: null, last_error: null };
      } catch (err) {
        return { status: "unhealthy", uptime_ms: null, memory_usage_bytes: null, last_error: String(err) };
      }
    },
  };
}

export {
  CrossrefWorksClient,
  authorName,
  containerTitle,
  dateToIso,
  firstAuthor,
  labelsFromWork,
  matchesConfiguredFilters,
  matchesFilters,
  nativeStatus,
  parseWorkSubjectId,
  priorityFromWork,
  statusFromWork,
  subjectFromWork,
  titleFromWork,
  workDoi,
  workSubjectId,
};

const plugin = definePlugin({
  kind: PluginKind.SubjectBackend,
  name: NAME,
  version: VERSION,
  description: "Crossref works subject backend plugin for Animus",
  subject_kinds: [SUBJECT_KIND],
  env_required: [
    { name: "CROSSREF_QUERY", description: "Optional Crossref query parameter for works.", required: false },
    { name: "CROSSREF_FILTER", description: "Optional Crossref filter expression.", required: false },
    { name: "CROSSREF_SORT", description: "Optional Crossref sort field.", required: false },
    { name: "CROSSREF_ORDER", description: "Optional Crossref sort order, such as asc or desc.", required: false },
    { name: "CROSSREF_SELECT", description: "Optional comma-separated Crossref fields to return.", required: false },
    { name: "CROSSREF_API_URL", description: `Optional Crossref API base URL. Defaults to ${DEFAULT_API_URL}.`, required: false },
    { name: "CROSSREF_MAILTO", description: "Optional email address for Crossref polite pool.", required: false },
    { name: "CROSSREF_LOCAL_QUERY", description: "Optional local text query applied to works after fetch.", required: false },
    { name: "CROSSREF_LIMIT", description: "Optional maximum work count from 1 to 1000. Defaults to 50.", required: false },
  ],
  impl: buildBackend(),
});

function isDirectRun(): boolean {
  const entry = process.argv[1] ?? "";
  return entry.endsWith("index.cjs") || entry.endsWith("index.js") || entry.endsWith(NAME);
}

if (isDirectRun()) {
  plugin.run().catch((err) => {
    process.stderr.write(`[${NAME}] fatal: ${String(err)}\n`);
    process.exit(1);
  });
}
