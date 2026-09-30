"""图片探测与小尺寸处理；没有 Pillow 时仍然可用。

只做三件事：读出像素尺寸（用于 Word 排版）、按 EXIF 方向摆正、把封面裁成 16:9。
裁封面需要 Pillow；装不上时直接使用原图，不影响成稿。
"""

from __future__ import annotations

import struct
from dataclasses import dataclass
from pathlib import Path

try:  # 可选依赖
    from PIL import Image, ImageOps
except Exception:  # pragma: no cover - 环境没有 Pillow
    Image = None
    ImageOps = None


IMAGE_SUFFIXES = frozenset({".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".tif", ".tiff"})
CONTENT_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".gif": "image/gif",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
}


class ImageError(ValueError):
    """图片无法读取或不适合排版。"""


@dataclass(frozen=True)
class ImageInfo:
    path: Path
    data: bytes
    width: int
    height: int
    suffix: str

    @property
    def content_type(self) -> str:
        return CONTENT_TYPES.get(self.suffix, "image/jpeg")

    @property
    def landscape(self) -> bool:
        return self.width >= self.height


def _png_size(data: bytes) -> tuple[int, int]:
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ImageError("不是有效的 PNG 文件。")
    width, height = struct.unpack(">II", data[16:24])
    return int(width), int(height)


def _jpeg_size(data: bytes) -> tuple[int, int]:
    if data[:2] != b"\xff\xd8":
        raise ImageError("不是有效的 JPEG 文件。")
    index = 2
    end = len(data)
    while index + 9 < end:
        if data[index] != 0xFF:
            index += 1
            continue
        marker = data[index + 1]
        if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
            index += 2
            continue
        length = struct.unpack(">H", data[index + 2:index + 4])[0]
        if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
            height, width = struct.unpack(">HH", data[index + 5:index + 9])
            return int(width), int(height)
        index += 2 + length
    raise ImageError("无法从 JPEG 文件中读出尺寸。")


def _gif_size(data: bytes) -> tuple[int, int]:
    width, height = struct.unpack("<HH", data[6:10])
    return int(width), int(height)


def probe_size(data: bytes, suffix: str) -> tuple[int, int]:
    suffix = suffix.lower()
    if suffix == ".png":
        return _png_size(data)
    if suffix in {".jpg", ".jpeg"}:
        return _jpeg_size(data)
    if suffix == ".gif":
        return _gif_size(data)
    if Image is not None:
        import io

        with Image.open(io.BytesIO(data)) as image:
            return int(image.width), int(image.height)
    raise ImageError(f"无法识别 {suffix} 图片的尺寸。")


def read_image(path: Path) -> ImageInfo:
    data = path.read_bytes()
    if not data:
        raise ImageError(f"图片是空文件：{path.name}")
    suffix = path.suffix.lower()
    try:
        width, height = probe_size(data, suffix)
    except ImageError:
        if Image is None:
            raise
        import io

        with Image.open(io.BytesIO(data)) as image:
            width, height = int(image.width), int(image.height)
    if width <= 0 or height <= 0:
        raise ImageError(f"图片尺寸异常：{path.name}")
    return ImageInfo(path, data, width, height, suffix)


def normalise(info: ImageInfo, destination: Path) -> ImageInfo:
    """保留原图：不裁剪、不重压缩、不转格式，直接写原始字节。"""
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(info.data)
    return ImageInfo(destination, info.data, info.width, info.height, destination.suffix.lower())


def make_cover(info: ImageInfo, destination: Path, *, max_width: int = 1600) -> ImageInfo:
    """保留原图作为封面：不裁 16:9、不缩放，直接写原始字节。"""
    destination = destination.with_suffix(".jpg")
    return normalise(info, destination)
