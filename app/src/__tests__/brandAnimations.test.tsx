/**
 * Animaciones de marca (orden 34, D-250): los componentes montan y respetan "reducir movimiento".
 */
import { act, render, screen } from '@testing-library/react-native';

let mockReduced = false;
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return { __esModule: true, ...actual, default: actual.default, useReducedMotion: () => mockReduced };
});

import { BrandLoading } from '@/components/brand/BrandLoading';
import { DoneOverlay, DoneOverlayHost, showDone } from '@/components/brand/DoneOverlay';
import { ALL_LAYERS, LogoLayers } from '@/components/brand/LogoLayers';
import { LETTER_LENGTHS, LOGO_PATHS, WAVE_PARTS } from '@/components/brand/logoPaths';
import { OpeningAnimation } from '@/components/brand/OpeningAnimation';

/** Cuántas capas del logo hay en pantalla (cada path aparece una vez por capa). */
function paths(): number {
  const json = JSON.stringify(screen.toJSON());
  return Object.values(LOGO_PATHS).filter((d) => json.includes(d.slice(0, 40))).length;
}

beforeEach(() => {
  mockReduced = false;
});

describe('LogoLayers', () => {
  test('dibuja los 5 paths del SVG de la marca', async () => {
    await render(<LogoLayers size={64} />);
    expect(paths()).toBe(5);
    expect(ALL_LAYERS).toHaveLength(5);
  });

  test('solo las capas pedidas', async () => {
    await render(<LogoLayers size={64} layers={['gota']} />);
    expect(paths()).toBe(1);
  });

  test('las olas partidas vuelven a dar el mismo path y las letras tienen largo', async () => {
    for (const k of ['olaPrincipal', 'olaClara'] as const) {
      const { parts, nums } = WAVE_PARTS[k];
      expect(parts).toHaveLength(nums.length + 1);
      expect(nums.length % 2).toBe(0);
      const d = parts.reduce((s, p, i) => s + p + (i < nums.length ? nums[i].toFixed(2) : ''), '');
      expect(d).toBe(LOGO_PATHS[k]);
    }
    expect(LETTER_LENGTHS.letraC).toBeGreaterThan(500);
    expect(LETTER_LENGTHS.letraD).toBeGreaterThan(500);
  });
});

describe('Cargando', () => {
  test('monta con el arco y su etiqueta', async () => {
    await render(<BrandLoading label="Cargando" />);
    expect(screen.getByLabelText('Cargando')).toBeTruthy();
    expect(screen.getByTestId('brand-loading-arc')).toBeTruthy();
  });

  test('con reducir movimiento: logo fijo, sin arco', async () => {
    mockReduced = true;
    await render(<BrandLoading label="Loading" />);
    expect(screen.getByLabelText('Loading')).toBeTruthy();
    expect(screen.queryByTestId('brand-loading-arc')).toBeNull();
  });
});

describe('Listo', () => {
  test('showDone lo muestra en el host, sin bloquear toques', async () => {
    await render(<DoneOverlayHost />);
    expect(screen.queryByTestId('done-overlay')).toBeNull();
    await act(async () => showDone());
    const overlay = screen.getByTestId('done-overlay');
    expect(overlay.props.pointerEvents).toBe('none');
    expect(screen.getByTestId('done-ring')).toBeTruthy();
  });

  test('con reducir movimiento: sin anillo y se cierra solo', async () => {
    jest.useFakeTimers();
    mockReduced = true;
    const onDone = jest.fn();
    await render(<DoneOverlay onDone={onDone} />);
    expect(screen.getByTestId('done-overlay')).toBeTruthy();
    expect(screen.queryByTestId('done-ring')).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(onDone).toHaveBeenCalled();
    jest.useRealTimers();
  });
});

describe('Apertura', () => {
  test('monta la animación', async () => {
    const onDone = jest.fn();
    await render(<OpeningAnimation onDone={onDone} />);
    expect(screen.getByTestId('opening-animation')).toBeTruthy();
    expect(paths()).toBe(5);
  });

  test('con reducir movimiento: no dibuja nada y entra a la app', async () => {
    mockReduced = true;
    const onDone = jest.fn();
    await render(<OpeningAnimation onDone={onDone} />);
    expect(screen.queryByTestId('opening-animation')).toBeNull();
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
