/*
 * Adapted from React Bits Silk by David Haz; rendered with the existing OGL dependency.
 * MIT + Commons Clause License Condition v1.0
 * Copyright (c) 2026 David Haz
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, and distribute the Software as part of an
 * application, website, or product, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * You may use this Software, including for any commercial purpose, so long as
 * you do not sell, sublicense, or redistribute the components themselves-whether
 * alone, in a bundle, or as a ported version.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 * Source: https://github.com/DavidHDev/react-bits/blob/main/src/content/Backgrounds/Silk/Silk.jsx
 */
'use client';

import { Renderer, Program, Mesh, Triangle } from 'ogl';
import { useEffect, useRef } from 'react';

const vertexShader = `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragmentShader = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec3 uColor;
uniform float uSpeed;
uniform float uScale;
uniform float uRotation;
uniform float uNoiseIntensity;

float noise(vec2 texCoord) {
  float e = 2.71828182845904523536;
  vec2 r = e * sin(e * texCoord);
  return fract(r.x * r.y * (1.0 + texCoord.x));
}

void main() {
  float c = cos(uRotation);
  float s = sin(uRotation);
  vec2 uv = mat2(c, -s, s, c) * (vUv * uScale);
  vec2 tex = uv * uScale;
  float tOffset = uSpeed * uTime;
  tex.y += 0.03 * sin(8.0 * tex.x - tOffset);
  float pattern = 0.6 + 0.4 * sin(
    5.0 * (tex.x + tex.y + cos(3.0 * tex.x + 5.0 * tex.y) + 0.02 * tOffset) +
    sin(20.0 * (tex.x + tex.y - 0.1 * tOffset))
  );
  float grain = noise(gl_FragCoord.xy) / 15.0 * uNoiseIntensity;
  gl_FragColor = vec4(clamp(uColor * pattern - vec3(grain), 0.0, 1.0), 1.0);
}
`;

export default function Silk({ color = '#9b2247', speed = 1.8, scale = 1, noiseIntensity = 0.25, rotation = 0.3 }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let renderer;
    let geometry;
    let program;
    let frame;

    const dispose = () => {
      cancelAnimationFrame(frame);
      frame = undefined;
      if (!renderer) return;
      const gl = renderer.gl;
      geometry?.remove();
      if (program) gl.deleteProgram(program.program);
      gl.canvas.remove();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      renderer = geometry = program = undefined;
    };

    const sync = () => {
      if (motionPreference.matches || document.hidden || !container.offsetWidth || !container.offsetHeight) {
        dispose();
        container.dataset.motion = motionPreference.matches ? 'reduced' : 'idle';
        return;
      }
      if (!renderer) {
        try {
          const canvas = document.createElement('canvas');
          if (!canvas.getContext('webgl2', { alpha: false }) && !canvas.getContext('webgl', { alpha: false })) {
            container.dataset.motion = 'fallback';
            return;
          }
          renderer = new Renderer({ canvas, alpha: false, dpr: Math.min(window.devicePixelRatio || 1, 1.5) });
          const gl = renderer.gl;
          gl.canvas.style.cssText = 'display: block; width: 100%; height: 100%; pointer-events: none;';
          gl.canvas.setAttribute('aria-hidden', 'true');
          geometry = new Triangle(gl);
          program = new Program(gl, {
            vertex: vertexShader,
            fragment: fragmentShader,
            uniforms: {
              uTime: { value: 0 },
              uColor: { value: [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16) / 255) },
              uSpeed: { value: speed },
              uScale: { value: scale },
              uRotation: { value: rotation },
              uNoiseIntensity: { value: noiseIntensity }
            }
          });
          const mesh = new Mesh(gl, { geometry, program });
          container.appendChild(gl.canvas);
          const startedAt = performance.now();
          const animate = time => {
            program.uniforms.uTime.value = (time - startedAt) * 0.0001;
            renderer.render({ scene: mesh });
            frame = requestAnimationFrame(animate);
          };
          frame = requestAnimationFrame(animate);
        } catch {
          dispose();
          container.dataset.motion = 'fallback';
          return;
        }
      }
      renderer.setSize(container.offsetWidth, container.offsetHeight);
      container.dataset.motion = 'full';
    };

    const observer = new ResizeObserver(sync);
    observer.observe(container);
    motionPreference.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    sync();

    return () => {
      observer.disconnect();
      motionPreference.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
      dispose();
    };
  }, [color, speed, scale, noiseIntensity, rotation]);

  return <div ref={containerRef} data-testid="login-silk" data-color={color} data-motion="pending" aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none', background: `radial-gradient(ellipse at 72% 24%, ${color}, transparent 65%), linear-gradient(135deg, #611232, #390c21)` }} />;
}
