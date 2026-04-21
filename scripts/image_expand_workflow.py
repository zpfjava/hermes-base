#!/usr/bin/env python3
"""
智能图片扩图工作流
将图片扩展到指定尺寸，保持主体元素不变
"""

import os
import sys
from PIL import Image, ImageFilter
import argparse

def expand_to_vertical(input_path, output_path, target_ratio=9/16):
    """
    将图片扩展为竖版（9:16比例）
    """
    img = Image.open(input_path)
    original_width, original_height = img.size
    
    # 计算目标尺寸
    if original_width / original_height > target_ratio:
        # 原图太宽，需要在上下扩展
        target_width = original_width
        target_height = int(original_width / target_ratio)
        expand_top = (target_height - original_height) // 2
        expand_bottom = target_height - original_height - expand_top
        expand_left = expand_right = 0
    else:
        # 原图太高，需要在左右扩展  
        target_height = original_height
        target_width = int(original_height * target_ratio)
        expand_left = (target_width - original_width) // 2
        expand_right = target_width - original_width - expand_left
        expand_top = expand_bottom = 0
    
    # 创建新画布
    background_color = get_dominant_background_color(img)
    new_img = Image.new('RGB', (target_width, target_height), background_color)
    
    # 粘贴原图
    new_img.paste(img, (expand_left, expand_top))
    
    # 如果需要，可以用模糊边缘填充
    if expand_top > 0 or expand_bottom > 0 or expand_left > 0 or expand_right > 0:
        new_img = apply_smart_fill(new_img, expand_left, expand_top, original_width, original_height)
    
    new_img.save(output_path)
    print(f"扩图完成: {output_path}")
    return output_path

def get_dominant_background_color(img):
    """获取图片边缘的主色调作为背景"""
    # 简单实现：取四个角的平均颜色
    width, height = img.size
    corners = [
        img.getpixel((0, 0)),
        img.getpixel((width-1, 0)),
        img.getpixel((0, height-1)),
        img.getpixel((width-1, height-1))
    ]
    avg_r = sum(c[0] for c in corners) // 4
    avg_g = sum(c[1] for c in corners) // 4  
    avg_b = sum(c[2] for c in corners) // 4
    return (avg_r, avg_g, avg_b)

def apply_smart_fill(img, x, y, width, height):
    """智能填充扩展区域"""
    # 这里可以集成更复杂的算法，比如：
    # - 边缘检测 + 内容感知填充
    # - 高斯模糊扩展
    # - AI 驱动的 outpainting
    return img

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='智能图片扩图工具')
    parser.add_argument('input', help='输入图片路径')
    parser.add_argument('output', help='输出图片路径') 
    parser.add_argument('--ratio', type=float, default=0.5625, help='目标宽高比 (默认 9:16 = 0.5625)')
    
    args = parser.parse_args()
    
    expand_to_vertical(args.input, args.output, args.ratio)