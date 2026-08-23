## Gate 2.5 independent semantic-test cosign

- Reviewer: `gate25-semantic-reviewer` — GPT-5.6 Terra general-purpose agent.
- Candidate: `6f8de2e6ed32660f3db17249774c9ccc96fa5c02`
- Frozen upstream: `ab7d5c92ace7029727d9bacb537b069be9c32f03`
- Accepted source: `09b553e5fc7c2b3a26954046c1d9f52c55af4b40`

The reviewer independently verified:

- all 687 upstream paths;
- 267 test-substrate rows;
- 251 exact-upstream blobs;
- 16 semantic rows;
- zero blob or partition mismatch;
- all 13 canonical groups green.

Final disposition: **PASS**. The reviewer identified one evidence typo:
gateway-methods was recorded as 588/588 although the exact canonical receipt is
214/214. The disposition table was corrected to 214/214; candidate bytes and
gate results are unchanged.
