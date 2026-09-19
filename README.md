# 가림 — 학생 개인정보 마스킹

Browser-only Korean student document redaction. Serves as plain static files. No user-document network uploads, authentication in the application, external APIs, telemetry, or browser document persistence. Site access is managed by hosting.

## Run

Serve `dist/` using an HTTP static server, e.g. `python3 -m http.server 8000 --directory dist`, then open that address. ES module workers and WebAssembly require HTTP/HTTPS, not `file://`. Production requires HTTPS. All models, workers, code and example files are same-origin assets. A server must serve `.wasm` as `application/wasm`, `.js` as JavaScript, and `.traineddata.gz` as bytes (without automatic HTTP Content-Encoding gzip).

## Architecture

- `dist/app.js`: multiple-file workflow, local OCR/face detection, visual review, rectangle editing, ID-based downloads and ZIP.
- `dist/school-record.js`: school-record recognition, layout-row grouping, whole-section boundaries and continuations, inferred current-grade ID, and adjustable footer bands.
- `dist/detect.js`: mapped text pattern/field-label detector, repeated-value search and student ID candidates. Heuristics, not universal named-entity recognition.
- `dist/pdf-worker.js`: isolated MuPDF operations; documents remain in worker memory until cleared or closed.
- `dist/engine.js`: original text and geometry extraction, page rendering, fresh-document page grafting and destructive text/image redaction.
- `dist/example.pdf`: original fictional regression sample.
- `dist/school-record-example.pdf`: three-page fictional school record with award and volunteer continuations, used by the Try example button.

PDF export uses MuPDF redaction, pixel removal and non-incremental full save with garbage collection. After destructive removal, opaque white page-content rectangles fill the selected areas. Rotation and crop transforms are respected; white rectangles alone are never used as a substitute for redaction. Preview uses translucent mint overlays and the Original control hides them. Native PDF content remains selectable. It never rasterizes a native page or adds OCR text layers. Original files are untouched. Annotation content, widgets, attachments, outlines and document metadata are not carried into the new PDF. Scanned and photographed text remains raster content. Existing OCR text layers in input PDFs are original content and are redacted alongside images.

## Limitations

Recognition requires human review. Handwriting, uncommon names, unusual school/address formats, outlined text, low-quality scans and small faces may be missed. Small embedded images are conservative photo candidates and may include diagrams; users can deselect them. Detection of students combined in a single file is not automatic splitting. One student per input file, up to 50 MiB per file, 350 MiB combined, 400 pages per document. Student IDs contain 3–12 digits. Colliding ZIP filenames are rejected.

HWP/HWPX/DOCX must first be exported to PDF. Faces are detected, never identified. Tesseract is used for image location detection only, not PDF reconstruction.

## Dependencies / licenses

Application: GNU AGPL-3.0-only; see LICENSE. Corresponding application source is downloadable at `/source.zip`.

Vendored distributions retain their license files:

- MuPDF JavaScript 1.28.1 — AGPL-3.0-or-later. [Upstream source](https://github.com/ArtifexSoftware/mupdf.js), [MuPDF source](https://github.com/ArtifexSoftware/mupdf).
- Tesseract.js 6.0.1 and Tesseract.js-core 6.0.0 — Apache-2.0. [Source](https://github.com/naptha/tesseract.js), [core source](https://github.com/naptha/tesseract.js-core).
- Korean and English Tesseract models: `@tesseract.js-data/kor@1.0.0`, `@tesseract.js-data/eng@1.0.0`, `4.0.0_best_int` distributions — Apache-2.0. [Model sources](https://github.com/tesseract-ocr/tessdata_best).
- @vladmandic/face-api 1.7.15, tiny face detector model only — MIT. [Source](https://github.com/vladmandic/face-api).
- fflate 0.8.2 — MIT. [Source](https://github.com/101arrowz/fflate).

No biometric embeddings, recognition models, age/gender models or emotion models are included.

## Validation

Run `node tests/engine.test.mjs`. Tests cover sensitive text removal while keeping original Korean text, scan/image pixel removal, metadata/attachment/annotation removal, rotated pages, repeated names, label layouts, student-ID ambiguity and custom words. Run `node tests/runtime.test.mjs` for local ID fallback, delayed worker startup, and error cleanup regression coverage. Real browser checks cover example PDF import, image file selection, scan detection, native preview, and export-link creation. The remote browser download event observer did not report a completed blob download, so device-specific download behavior remains a limitation of that verification. A persistent download link and PDF-opening link are provided.

## Development preview

Run `npm ci` then `npm run dev`. Production remains the plain static `dist/` output; Vite is only the development server. Version 2 waits for the PDF worker readiness event and uses IDs compatible with non-secure contexts and older browsers. Export generation does not claim that a file has reached the device; users explicitly click the resulting download link.

## School-record sections

On import, recognizable school-record titles or a combination of section headings turn on the per-document school-record panel. Five independently selectable groups cover the entire photo-adjacent graduation-register and grade/department/class/number/homeroom-teacher table, personal/enrollment information, awards, volunteer records, and every page footer. Recognition uses heading text rather than fixed section numbers. Known headings and unknown numbered headings end the previous section; repeated target headings and repeated creative-activity headings preserve volunteer continuations. Whole-section candidates are listed before supplementary word candidates; contained word candidates are restored if a group is turned off.

Footers default to 8% of page height, increased when recognized footer labels occur higher up; users can adjust 3–18%. Missing target headings are reported. These are layout heuristics: unusual forms, nonstandard headings, handwriting, merged/poor OCR text, and omitted section titles require manual review. It does not promise exact coverage of every school-record format. A clear top table can propose a five-digit filename from the most recent grade/class/number; the user can edit it to match the school's student-ID format.

Run `npm test` for all regression tests. School-record tests verify multi-page section removal, retained native Korean text, per-group deselection, every-page footers, OCR whitespace, non-record rejection, and white pixels on rotated/cropped/color-background pages. `python3 tests/create-school-fixture.py` regenerates the example with PyMuPDF and ReportLab. The version 3 DOM integration check passed import, automatic switches, per-document overrides, review invalidation, footer adjustment, and real PDF export; rendered-browser QA was unavailable because browser tab discovery timed out. PDF output pages were rendered and visually inspected.

Volunteer continuations require an explicit 봉사활동 실적 heading on the new page. A repeated 창의적 체험활동 heading ends the prior volunteer block, so 자율활동 and 동아리활동 narrative rows remain visible.

The photo-adjacent table detector accepts multi-row and diagonal grade/category headers. It includes a preceding graduation-register-number row and treats department as a separate column when proposing student IDs. With a register label and multiple valid grade rows, it can bound the table even if the next section heading is absent. Regression coverage includes this layout, cropped and OCR-positioned rows, graduation-register removal, and the original single-line header. The example uses fictional names and values only.

Name detection begins only at the exact label 성명. The candidate must be on the same text line or in an immediately adjacent table cell. All other labels, including 이름 and 담임성명, and all prose are excluded from name detection. A name established from 성명 may still be redacted when it repeats elsewhere in the same document.

## Batch export

Add multiple student files in one selection. When all files finish analysis and each has one valid, non-duplicated student ID, ZIP preparation starts automatically after every file finishes analysis. The resulting `학번별_자동마스킹.zip` contains one `<학번>.pdf` for each input, and only the completed download control is shown. Editing a mask or a student ID prepares a replacement ZIP automatically. Files with an unreadable or duplicate ID are named in the on-screen status and block preparation until corrected.
