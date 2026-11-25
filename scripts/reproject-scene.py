"""
Turns an equirectangular 360° photo into a "what you see" scene image for the radar.

The radar uses an azimuthal equidistant projection: the distance from the centre is the angle from
straight ahead, the same in every direction, with up at the top and the wearer's left on the left.
The output is a square image holding a disc whose radius is `--limit` degrees from straight ahead;
the chart places it so that its edge sits at that angle on the radar's scale. The projection is
linear in angle, so the one image fits every reach the chart is drawn at.

The living room comes from the tonemapped JPG of https://polyhaven.com/a/anniversary_lounge (CC0):
  python3 -I scripts/reproject-scene.py anniversary_lounge.jpg public/scenes/living-room.webp \
      --ahead 0.4156 --size 3072 --quality 64

`--ahead` is the column straight ahead, as a share of the source's width (0.5 is the photo's
centre); the horizon stays the photo's middle row, so a level photo stays level.

Needs Python 3 with Pillow (WebP support) and NumPy.
"""

import argparse
import math

import numpy
from PIL import Image

# Poly Haven's tonemapped JPGs are 8192 pixels wide, past Pillow's guard against decompression bombs.
Image.MAX_IMAGE_PIXELS = 8192 * 4096
# Rendered larger and scaled down, so each output pixel averages several samples of the source.
SUPERSAMPLING = 2
# Never seen: the chart clips the image to its plot, which never reaches past the disc.
OUTSIDE_COLOUR = (128, 128, 128)


def parse_arguments():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('source', help='equirectangular photo, twice as wide as high')
    parser.add_argument('target', help='output image; the extension picks the format (.webp or .jpg)')
    parser.add_argument('--ahead', type=float, default=0.5, help='column straight ahead, as a share of the width')
    parser.add_argument('--limit', type=float, default=180.0, help='degrees from straight ahead at the disc edge')
    parser.add_argument('--size', type=int, default=2048, help='width and height of the output in pixels')
    parser.add_argument('--quality', type=int, default=72, help='lossy quality, 1 to 100')
    return parser.parse_args()


def sample_bilinear(source, columns, rows):
    """Samples the source at fractional pixel positions; columns wrap around, rows stop at the poles."""
    height, width = source.shape[:2]
    left = numpy.floor(columns).astype(numpy.int64)
    top = numpy.clip(numpy.floor(rows).astype(numpy.int64), 0, height - 1)
    across = (columns - left)[..., None]
    down = numpy.clip(rows - top, 0, 1)[..., None]
    right = (left + 1) % width
    left = left % width
    bottom = numpy.clip(top + 1, 0, height - 1)
    upper = source[top, left] * (1 - across) + source[top, right] * across
    lower = source[bottom, left] * (1 - across) + source[bottom, right] * across
    return upper * (1 - down) + lower * down


def reproject(source, size, limit_degrees, ahead_share):
    height, width = source.shape[:2]
    centre = (size - 1) / 2
    pixel_columns, pixel_rows = numpy.meshgrid(numpy.arange(size), numpy.arange(size))
    rightward = (pixel_columns - centre) / (size / 2)
    upward = (centre - pixel_rows) / (size / 2)
    from_centre = numpy.hypot(rightward, upward)
    from_ahead = numpy.radians(numpy.minimum(from_centre, 1) * limit_degrees)
    around = numpy.arctan2(upward, rightward)

    # The direction in the viewer's frame: right, up, ahead.
    right_part = numpy.sin(from_ahead) * numpy.cos(around)
    up_part = numpy.sin(from_ahead) * numpy.sin(around)
    ahead_part = numpy.cos(from_ahead)

    longitude = numpy.arctan2(right_part, ahead_part)
    latitude = numpy.arcsin(numpy.clip(up_part, -1, 1))
    columns = (ahead_share + longitude / (2 * math.pi)) * width - 0.5
    rows = (0.5 - latitude / math.pi) * height - 0.5

    picture = sample_bilinear(source, columns, rows)
    picture[from_centre > 1] = OUTSIDE_COLOUR
    return picture


def main():
    arguments = parse_arguments()
    with Image.open(arguments.source) as opened:
        source = numpy.asarray(opened.convert('RGB'), dtype=numpy.float32)
    rendered_size = arguments.size * SUPERSAMPLING
    picture = reproject(source, rendered_size, arguments.limit, arguments.ahead)
    image = Image.fromarray(numpy.clip(picture + 0.5, 0, 255).astype(numpy.uint8))
    image = image.resize((arguments.size, arguments.size), Image.Resampling.LANCZOS)
    image.save(arguments.target, quality=arguments.quality, method=6)


if __name__ == '__main__':
    main()
