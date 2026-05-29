import { describe, expect, it } from "vitest";
import {
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
} from "./index";

const config = {
  apiUrl: "https://api.crossref.org",
  query: "machine learning",
  limit: 50,
};

const work = {
  DOI: "10.5555/example.2026",
  URL: "https://doi.org/10.5555/example.2026",
  title: ["Machine Learning with Sklearn"],
  subtitle: ["A practical chapter"],
  type: "book-chapter",
  publisher: "Oxford University Press",
  "container-title": ["Practical Machine Learning"],
  subject: ["Artificial Intelligence", "Computer Science"],
  author: [
    {
      given: "Jane",
      family: "Doe",
      sequence: "first",
      ORCID: "https://orcid.org/0000-0000-0000-0000",
    },
  ],
  issued: { "date-parts": [[2026, 5, 29]] },
  published: { "date-parts": [[2026]] },
  created: { "date-time": "2026-05-30T10:00:00Z" },
  deposited: { "date-time": "2026-05-31T10:00:00Z" },
  "is-referenced-by-count": 156,
  score: 12.3,
  license: [{ URL: "https://creativecommons.org/licenses/by/4.0/" }],
  link: [{ URL: "https://example.com/fulltext.pdf", "content-type": "application/pdf" }],
};

describe("Crossref work helpers", () => {
  it("builds ids", () => {
    expect(workDoi(work)).toBe("10.5555/example.2026");
    expect(workSubjectId(work.DOI)).toBe("crossref.work:10.5555%2Fexample.2026");
    expect(parseWorkSubjectId("crossref.work:10.5555%2Fexample.2026")).toBe(work.DOI);
  });

  it("maps works to subjects", () => {
    const subject = subjectFromWork(config, work);
    expect(subject.id).toBe("crossref.work:10.5555%2Fexample.2026");
    expect(subject.kind).toBe("crossref.work");
    expect(subject.title).toBe("Machine Learning with Sklearn");
    expect(subject.status).toBe("done");
    expect(subject.native_status).toBe("book-chapter");
    expect(subject.assignee).toBe("Jane Doe");
    expect(subject.created_at).toBe("2026-05-29T00:00:00.000Z");
    expect(subject.updated_at).toBe("2026-05-31T10:00:00.000Z");
    expect(subject.priority).toBe(1);
    expect(subject.custom?.doi).toBe("10.5555/example.2026");
  });

  it("maps native status and priority", () => {
    expect(titleFromWork(work)).toBe("Machine Learning with Sklearn");
    expect(containerTitle(work)).toBe("Practical Machine Learning");
    expect(authorName(work.author[0]!)).toBe("Jane Doe");
    expect(firstAuthor(work)).toBe("Jane Doe");
    expect(nativeStatus(work)).toBe("book-chapter");
    expect(statusFromWork(work)).toBe("done");
    expect(priorityFromWork({ ...work, "is-referenced-by-count": 1000 })).toBe(0);
    expect(priorityFromWork(work)).toBe(1);
    expect(priorityFromWork({ ...work, "is-referenced-by-count": 25 })).toBe(2);
    expect(priorityFromWork({ ...work, "is-referenced-by-count": 2 })).toBe(3);
  });

  it("builds labels", () => {
    expect(labelsFromWork(config, work)).toEqual([
      "crossref",
      "book-chapter",
      "query:machine learning",
      "publisher:Oxford University Press",
      "container:Practical Machine Learning",
      "subject:Artificial Intelligence",
      "subject:Computer Science",
      "author:Jane Doe",
    ]);
  });

  it("filters by query and list params", () => {
    expect(matchesConfiguredFilters(config, work)).toBe(true);
    expect(matchesConfiguredFilters({ ...config, localQuery: "computer science" }, work)).toBe(true);
    expect(matchesConfiguredFilters({ ...config, localQuery: "does-not-match" }, work)).toBe(false);
    expect(matchesFilters(config, work, { status: ["done"] })).toBe(true);
    expect(matchesFilters(config, work, { labels_all: ["crossref", "book-chapter"] })).toBe(true);
    expect(matchesFilters(config, work, { labels_any: ["publisher:Oxford University Press"] })).toBe(true);
  });

  it("normalizes dates", () => {
    expect(dateToIso({ "date-parts": [[2026]] })).toBe("2026-01-01T00:00:00.000Z");
    expect(dateToIso({ "date-time": "2026-05-30T10:00:00Z" })).toBe("2026-05-30T10:00:00.000Z");
    expect(dateToIso(undefined)).toBeUndefined();
  });
});
