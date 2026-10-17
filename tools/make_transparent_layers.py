from pathlib import Path

from collections import deque
import math

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ASSET_DIR = Path(__file__).resolve().parents[1] / "assets"
BACKGROUND = (36, 38, 37)
SOURCES = {
    "platter-export.png": "platter-layer.png",
    "fader-track-export.png": "fader-track-layer.png",
    "fader-handle-export.png": "fader-handle-layer.png",
    "paperclip-export.png": "paperclip-layer.png",
    "sticker-yellow-export.png": "sticker-yellow-layer.png",
    "sticker-white-export.png": "sticker-white-layer.png",
    "spindle-export.png": "spindle-layer.png",
}


def remove_flat_figma_background(source: Path, destination: Path) -> None:
    image = Image.open(source).convert("RGBA")
    pixels = image.load()

    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            if (red, green, blue) == BACKGROUND:
                pixels[x, y] = (red, green, blue, 0)
            else:
                pixels[x, y] = (red, green, blue, alpha)

    image.save(destination, optimize=True)


def remove_figma_background_with_soft_edge(
    source: Path,
    destination: Path,
) -> None:
    image = Image.open(source).convert("RGBA")
    pixels = image.load()
    background_red, background_green, background_blue = BACKGROUND

    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, source_alpha = pixels[x, y]
            distance = math.sqrt(
                (red - background_red) ** 2
                + (green - background_green) ** 2
                + (blue - background_blue) ** 2
            )

            if distance <= 2:
                pixels[x, y] = (red, green, blue, 0)
                continue

            if distance >= 55:
                pixels[x, y] = (red, green, blue, source_alpha)
                continue

            recovered_alpha = (distance - 2) / 53
            output_alpha = round(source_alpha * recovered_alpha)
            recovered_red = round(
                (red - (1 - recovered_alpha) * background_red)
                / recovered_alpha
            )
            recovered_green = round(
                (green - (1 - recovered_alpha) * background_green)
                / recovered_alpha
            )
            recovered_blue = round(
                (blue - (1 - recovered_alpha) * background_blue)
                / recovered_alpha
            )
            pixels[x, y] = (
                max(0, min(255, recovered_red)),
                max(0, min(255, recovered_green)),
                max(0, min(255, recovered_blue)),
                output_alpha,
            )

    image.save(destination, optimize=True)


def strip_baked_shadow_to_silhouette(path: Path) -> None:
    """Keep the tag artwork, but replace its baked hard shadow with a clean edge."""
    image = Image.open(path).convert("RGBA")
    width, height = image.size
    pixels = image.load()

    candidates = bytearray(width * height)
    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            if alpha > 16 and max(red, green, blue) > 78:
                candidates[y * width + x] = 1

    visited = bytearray(width * height)
    largest_component: list[int] = []
    for start in range(width * height):
        if candidates[start] == 0 or visited[start]:
            continue

        component: list[int] = []
        queue = deque([start])
        visited[start] = 1
        while queue:
            index = queue.popleft()
            component.append(index)
            x = index % width
            y = index // width
            for next_index in (
                index - 1 if x > 0 else -1,
                index + 1 if x + 1 < width else -1,
                index - width if y > 0 else -1,
                index + width if y + 1 < height else -1,
            ):
                if (
                    next_index >= 0
                    and candidates[next_index]
                    and not visited[next_index]
                ):
                    visited[next_index] = 1
                    queue.append(next_index)

        if len(component) > len(largest_component):
            largest_component = component

    body = bytearray(width * height)
    for index in largest_component:
        body[index] = 1

    outside = bytearray(width * height)
    queue: deque[int] = deque()
    for x in range(width):
        for index in (x, (height - 1) * width + x):
            if body[index] == 0 and outside[index] == 0:
                outside[index] = 1
                queue.append(index)
    for y in range(height):
        for index in (y * width, y * width + width - 1):
            if body[index] == 0 and outside[index] == 0:
                outside[index] = 1
                queue.append(index)

    while queue:
        index = queue.popleft()
        x = index % width
        y = index // width
        for next_index in (
            index - 1 if x > 0 else -1,
            index + 1 if x + 1 < width else -1,
            index - width if y > 0 else -1,
            index + width if y + 1 < height else -1,
        ):
            if next_index >= 0 and body[next_index] == 0 and outside[next_index] == 0:
                outside[next_index] = 1
                queue.append(next_index)

    silhouette = Image.new("L", image.size, 0)
    silhouette.putdata([255 if not outside[index] else 0 for index in range(width * height)])
    silhouette = silhouette.filter(ImageFilter.GaussianBlur(0.65))
    image.putalpha(ImageChops.multiply(image.getchannel("A"), silhouette))
    image.save(path, optimize=True)


def render_clean_tonearm_layer() -> None:
    """Rebuild the Figma crop from the original transparent source, without its baked shadow."""
    source = Image.open(ASSET_DIR / "tonearm-sheet.png").convert("RGBA")
    source = source.resize((1245, 934), Image.Resampling.LANCZOS)

    cropped = Image.new("RGBA", (373, 898), (0, 0, 0, 0))
    cropped.alpha_composite(source, (-425, 0))
    rotated = cropped.rotate(
        -35.47,
        resample=Image.Resampling.BICUBIC,
        expand=True,
    )

    layer = Image.new("RGBA", (833, 959), (0, 0, 0, 0))
    layer.alpha_composite(
        rotated,
        ((layer.width - rotated.width) // 2, (layer.height - rotated.height) // 2),
    )
    layer.save(ASSET_DIR / "tonearm-layer.png", optimize=True)


for source_name, destination_name in SOURCES.items():
    remove_flat_figma_background(
        ASSET_DIR / source_name,
        ASSET_DIR / destination_name,
    )

render_clean_tonearm_layer()

remove_figma_background_with_soft_edge(
    ASSET_DIR / "tag-blue-export.png",
    ASSET_DIR / "tag-front-layer.png",
)
remove_figma_background_with_soft_edge(
    ASSET_DIR / "tag-white-export.png",
    ASSET_DIR / "tag-back-layer.png",
)
strip_baked_shadow_to_silhouette(ASSET_DIR / "tag-front-layer.png")
strip_baked_shadow_to_silhouette(ASSET_DIR / "tag-back-layer.png")


def high_resolution_mask(size: tuple[int, int]) -> Image.Image:
    scale = 4
    mask = Image.new("L", (size[0] * scale, size[1] * scale), 0)
    draw = ImageDraw.Draw(mask)

    arm_path = [
        (75, 726),
        (150, 700),
        (235, 670),
        (315, 642),
        (374, 596),
        (405, 540),
        (426, 474),
        (454, 407),
        (493, 355),
        (535, 315),
        (566, 295),
    ]
    counterweight_path = [(566, 295), (620, 220), (674, 147)]

    draw.line(
        [(x * scale, y * scale) for x, y in arm_path],
        fill=255,
        width=70 * scale,
        joint="curve",
    )
    draw.line(
        [(x * scale, y * scale) for x, y in counterweight_path],
        fill=255,
        width=105 * scale,
        joint="curve",
    )
    draw.ellipse(
        ((614 * scale, 91 * scale), (724 * scale, 211 * scale)),
        fill=255,
    )
    draw.ellipse(
        ((530 * scale, 258 * scale), (603 * scale, 332 * scale)),
        fill=255,
    )
    draw.polygon(
        [
            (55 * scale, 700 * scale),
            (198 * scale, 646 * scale),
            (250 * scale, 673 * scale),
            (224 * scale, 723 * scale),
            (172 * scale, 742 * scale),
            (176 * scale, 792 * scale),
            (145 * scale, 793 * scale),
            (137 * scale, 753 * scale),
            (61 * scale, 770 * scale),
        ],
        fill=255,
    )

    return mask.resize(size, Image.Resampling.LANCZOS)


def split_tonearm_layers() -> None:
    source = Image.open(ASSET_DIR / "tonearm-layer.png").convert("RGBA")
    width, height = source.size
    moving_mask = high_resolution_mask(source.size)
    inpaint_mask = moving_mask.filter(ImageFilter.MaxFilter(41))

    base_mask = Image.new("L", source.size, 0)
    base_draw = ImageDraw.Draw(base_mask)
    base_draw.ellipse((358, 104, 722, 468), fill=255)
    base_draw.line([(551, 328), (520, 508)], fill=255, width=28)

    source_pixels = source.load()
    moving_pixels = moving_mask.load()
    inpaint_pixels = inpaint_mask.load()
    base_pixels = base_mask.load()
    base = Image.new("RGBA", source.size, (0, 0, 0, 0))
    base_output = base.load()
    center_x, center_y = 540.0, 286.0

    for y in range(height):
        for x in range(width):
            if base_pixels[x, y] == 0:
                continue

            if inpaint_pixels[x, y] < 16:
                base_output[x, y] = source_pixels[x, y]
                continue

            radius = math.hypot(x - center_x, y - center_y)
            angle = math.atan2(y - center_y, x - center_x)
            replacement = None
            for step in range(1, 31):
                for direction in (1, -1):
                    candidate_angle = angle + direction * step * math.pi / 30
                    sample_x = round(center_x + math.cos(candidate_angle) * radius)
                    sample_y = round(center_y + math.sin(candidate_angle) * radius)
                    if not (0 <= sample_x < width and 0 <= sample_y < height):
                        continue
                    if base_pixels[sample_x, sample_y] == 0:
                        continue
                    if inpaint_pixels[sample_x, sample_y] >= 16:
                        continue
                    sample = source_pixels[sample_x, sample_y]
                    if sample[3] > 240:
                        replacement = sample
                        break
                if replacement is not None:
                    break

            base_output[x, y] = replacement or (26, 28, 27, 255)

    moving = source.copy()
    moving.putalpha(Image.composite(source.getchannel("A"), Image.new("L", source.size, 0), moving_mask))

    base.save(ASSET_DIR / "tonearm-base-layer.png", optimize=True)
    moving.save(ASSET_DIR / "tonearm-moving-layer.png", optimize=True)


split_tonearm_layers()
