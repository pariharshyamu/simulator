# Course material and source data

`course_material.md` is the full 378-page participant handout and delivery script;
the `handout-*.md` files are the chapter drafts it was assembled from, kept because
they are easier to edit.

`JUNE2026_DATA_BRIEF.md` is the authoritative brief every artefact was written
against — Tables A to D and the ranked pain points. **No figure appears anywhere in
this repository that is not traceable to it.**

`june2026.json` is the same data as structured records, with derived fields
(gross heat rate, gaps, ₹/kcal) computed by `recalc.py`.

`fuel_june2026.pdf` is the source: the MAHAGENCO June-2026 energy bill, the
provisional Part-I FSA bill with the F10 ECR calculation, and the MERC merit-order
dispatch stack for July 2026. `fuel.txt` is its extracted text.

> Net heat rate already contains auxiliary power. The net-heat-rate gap and the
> auxiliary excess overlap by construction and are **not additive**.
