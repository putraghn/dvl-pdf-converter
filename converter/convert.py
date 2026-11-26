"""Child process: convert one PDF to DOCX. Usage: convert.py <in.pdf> <out.docx>"""
import sys
from pdf2docx import Converter

src, dst = sys.argv[1], sys.argv[2]
cv = Converter(src)
try:
    cv.convert(dst, start=0, end=None)
finally:
    cv.close()