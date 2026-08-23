## Gate 4 preservation cosign

- Candidate: `6f8de2e6ed32660f3db17249774c9ccc96fa5c02`
- Frozen upstream: `ab7d5c92ace7029727d9bacb537b069be9c32f03`
- Accepted source: `09b553e5fc7c2b3a26954046c1d9f52c55af4b40`
- Authority: `6dd6c3a7712c8ae02937a29054525b2ddacb89c1`
- Reviewers:
  - `final-gate-cosigner` — GPT-5.6 Terra rubber-duck;
  - `final-gate-cosigner-renewal` — Claude Opus 5 rubber-duck;
  - `gate-evidence-correction-verifier` — GPT-5.6 Luna rubber-duck.

The first pass independently reconciled geometry, Gate 2, Gate 2.5, Gate 2.7,
and consequential source unions. It found two evidence blockers: authority was
not reachable from the audit clone, and the baseline total was recorded as
13,484 instead of 13,483.

The renewal pass verified the new authority refs and exact gate blobs,
recomputed all 293 exact-overlay rows from git objects, and found no dropped
upstream hunk. It identified four non-candidate evidence defects: the frond
skill path, Signal/Telegram wording, stale continuity metadata, and an
ambiguous disposition-total field.

The final correction verifier independently confirmed:

- all 12 authority rows resolve to exact blobs;
- baseline arithmetic is 4,277 files and 13,483 assertions;
- Gate 2 manual coverage is 10/10;
- Gate 2.5 semantic coverage is 16/16;
- Gate 2.7 mixed coverage is 317/317;
- total Gate 2.7 dispositions are 319, including two shared-genuine rows;
- the sole changed mixed row is `config/assertion-safety-baseline.txt`, and its
  review is renewed.

Final disposition: **PASS**. Unresolved rows: zero. No P0/P1 finding.
