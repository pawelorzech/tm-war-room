## 2024-05-18 - [Fix XSS in dangerouslySetInnerHTML]
**Vulnerability:** XSS vulnerability through dangerouslySetInnerHTML via unsanitized data
**Learning:** Raw string interpolations in `dangerouslySetInnerHTML` should always be sanitized using `DOMPurify`.
**Prevention:** Always parse and sanitize data via `isomorphic-dompurify` before passing to `__html`
