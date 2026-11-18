# Branding research

Candidate brand directions for Vision Flow. The adopted brand is in [`../branding`](../branding/README.md).

| Round | Contents | Outcome |
| --- | --- | --- |
| [`chatgpt-v1`](chatgpt-v1/README.md) | Three directions (Flow Stack, Signal Frame, Verified Layer), one SVG concept board each | Not adopted |
| [`claude-v2`](claude-v2/README.md) | Three packages with logo sets, tokens, and rendered boards | 01 Field Lines adopted and moved to `docs/branding`. 02 Schema Aperture and 03 Evidence Box remain here. |

Ideas from the other packages that are still worth borrowing:

- **02 Schema Aperture:** "Change the schema, not the pipeline" and the mono schema styling (`lottery_sales v3`, field keys, fingerprints) for the schema editor and architecture slides.
- **03 Evidence Box:** confidence bars, the evidence block, and the review queue layout for a future review screen. Region boxes would need coordinates in the field envelope; `evidence` is currently text.

`claude-v2/build.ts` still renders all three boards, writing package 01's board into `docs/branding`.
