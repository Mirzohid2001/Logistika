from __future__ import annotations

from pathlib import Path

from PIL import Image, UnidentifiedImageError

MAX_VERIFICATION_IMAGE_BYTES = 10 * 1024 * 1024
MAX_VERIFICATION_IMAGE_PIXELS = 40_000_000
ALLOWED_VERIFICATION_IMAGE_TYPES = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
}
ALLOWED_VERIFICATION_IMAGE_FORMATS = {
    'JPEG': 'jpg',
    'PNG': 'png',
    'WEBP': 'webp',
}


def validate_verification_image(uploaded_file) -> str:
    """Validate verification content and return a safe file extension."""
    if not uploaded_file:
        raise ValueError('Hujjat rasmi topilmadi')
    if uploaded_file.size <= 0:
        raise ValueError('Bo\'sh fayl yuborib bo\'lmaydi')
    if uploaded_file.size > MAX_VERIFICATION_IMAGE_BYTES:
        raise ValueError('Har bir hujjat rasmi 10 MB dan oshmasligi kerak')

    content_type = str(getattr(uploaded_file, 'content_type', '') or '').lower()
    if content_type not in ALLOWED_VERIFICATION_IMAGE_TYPES:
        raise ValueError('Faqat JPG, PNG yoki WEBP rasm yuborish mumkin')

    try:
        uploaded_file.seek(0)
        with Image.open(uploaded_file) as image:
            image_format = str(image.format or '').upper()
            if image_format not in ALLOWED_VERIFICATION_IMAGE_FORMATS:
                raise ValueError('Rasm formati qo\'llab-quvvatlanmaydi')
            width, height = image.size
            if width <= 0 or height <= 0 or width * height > MAX_VERIFICATION_IMAGE_PIXELS:
                raise ValueError('Rasm o\'lchami juda katta yoki noto\'g\'ri')
            image.verify()
    except ValueError:
        raise
    except (UnidentifiedImageError, OSError, SyntaxError) as exc:
        raise ValueError('Fayl haqiqiy rasm emas yoki buzilgan') from exc
    finally:
        uploaded_file.seek(0)

    detected_extension = ALLOWED_VERIFICATION_IMAGE_FORMATS[image_format]
    declared_extension = ALLOWED_VERIFICATION_IMAGE_TYPES[content_type]
    source_extension = Path(str(getattr(uploaded_file, 'name', '') or '')).suffix.lower().lstrip('.')
    if source_extension == 'jpeg':
        source_extension = 'jpg'
    if source_extension and source_extension not in {'jpg', 'png', 'webp'}:
        raise ValueError('Fayl kengaytmasi rasm formatiga mos emas')
    if declared_extension != detected_extension or (source_extension and source_extension != detected_extension):
        raise ValueError('Fayl turi va rasm formati bir-biriga mos emas')
    return detected_extension
