from pathlib import Path
import io
import zipfile

class DocumentParseError(ValueError):
    pass

MAX_DOCUMENT_BYTES = 15 * 1024 * 1024

def validate_file_content(filename: str, data: bytes) -> None:
    suffix = Path(filename).suffix.lower()
    if suffix not in {".pdf", ".docx", ".txt", ".md"}:
        raise DocumentParseError("Supported formats: PDF, DOCX, TXT and MD.")
    if not data:
        raise DocumentParseError("The uploaded file is empty.")
    if len(data) > MAX_DOCUMENT_BYTES:
        raise DocumentParseError("The uploaded file exceeds the 15 MB limit.")
    if suffix == ".pdf" and not data.startswith(b"%PDF-"):
        raise DocumentParseError("The file does not have a valid PDF signature.")
    if suffix == ".docx":
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                names = set(archive.namelist())
                if "[Content_Types].xml" not in names or "word/document.xml" not in names:
                    raise DocumentParseError("The file is not a valid DOCX document.")
        except zipfile.BadZipFile as exc:
            raise DocumentParseError("The file is not a valid DOCX document.") from exc
    if suffix in {".txt", ".md"}:
        if b"\x00" in data:
            raise DocumentParseError("Text files must not contain binary data.")
        try:
            data.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise DocumentParseError("Text files must use UTF-8 encoding.") from exc

def extract_text(filename: str, data: bytes) -> str:
    validate_file_content(filename, data)
    suffix = Path(filename).suffix.lower()
    if suffix == '.txt' or suffix == '.md':
        return data.decode('utf-8-sig').strip()
    if suffix == '.docx':
        try:
            from docx import Document
            doc = Document(io.BytesIO(data))
            parts = [p.text for p in doc.paragraphs if p.text.strip()]
            for table in doc.tables:
                for row in table.rows:
                    parts.append(' | '.join(cell.text for cell in row.cells))
            return '\n'.join(parts).strip()
        except Exception as exc:
            raise DocumentParseError(f'Could not parse DOCX: {exc}') from exc
    if suffix == '.pdf':
        try:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(data)) as pdf:
                return '\n'.join(page.extract_text() or '' for page in pdf.pages).strip()
        except Exception as exc:
            raise DocumentParseError(f'Could not parse PDF: {exc}') from exc
    raise DocumentParseError('Supported formats: PDF, DOCX, TXT and MD. Scanned PDF OCR is not enabled in this MVP.')
