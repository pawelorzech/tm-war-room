## 2024-05-22 - XSS via Unsanitized Backend HTML in dangerouslySetInnerHTML
**Vulnerability:** Frontend components using `dangerouslySetInnerHTML` directly with unsanitized backend data.
**Learning:** Found multiple instances where the frontend trusted backend HTML data, leading to a Cross-Site Scripting (XSS) vulnerability.
**Prevention:** Always sanitize any untrusted or backend-provided HTML content using an established sanitizer like `DOMPurify` before passing it to `dangerouslySetInnerHTML`.
