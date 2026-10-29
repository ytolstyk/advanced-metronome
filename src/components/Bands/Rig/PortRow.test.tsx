import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DRAG_GRIP_ATTRIBUTE } from '../../../hooks/usePointerDrag';
import { resolveNodes } from '../../../rigData';
import { GEO, computeRigLayout } from '../../../rigRouting';
import type { PlacedNode, PlacedPort } from '../../../rigRouting';
import { JAM_STATION_DIAGRAM, JAM_STATION_GEAR } from '../../../rigPresets';
import { RIG_PALETTE } from '../../../rigUtils';
import { PortRow } from './PortRow';

const layout = computeRigLayout(resolveNodes(JAM_STATION_DIAGRAM, JAM_STATION_GEAR), JAM_STATION_DIAGRAM.cables);
const nodeOf = (id: string): PlacedNode => layout.nodes.find((n) => n.id === id)!;
const portOf = (nodeId: string, portId: string): PlacedPort => layout.ports.find((p) => p.nodeId === nodeId && p.portId === portId)!;

const PLUG_TITLE = 'Drag to move this end of the cable';

type Props = Parameters<typeof PortRow>[0];

function setup(over: Partial<Props> = {}) {
  const props: Props = {
    node: nodeOf('nscarlet'),
    placed: portOf('nscarlet', 'in02'),
    color: undefined,
    editable: true,
    connecting: false,
    isOrigin: false,
    isTarget: false,
    onClick: vi.fn(),
    ...over,
  };
  const view = render(<PortRow {...props} />);
  const row = (view.container.firstElementChild as HTMLElement)!;
  const dot = () => row.querySelector<HTMLElement>('span.rounded-full')!;
  const plug = () => view.container.querySelector<HTMLElement>(`[title="${PLUG_TITLE}"]`);
  return { ...view, props, row, dot, plug };
}

describe('PortRow', () => {
  describe('content', () => {
    it('shows the direction mark, the label and the note', () => {
      const { row } = setup();
      expect(row).toHaveTextContent('▸ Ch 2 · Bass');
      expect(row).toHaveTextContent('INST on');
    });

    it('uses a different mark per direction', () => {
      const out = setup({ node: nodeOf('nbass'), placed: portOf('nbass', 'out1') });
      expect(out.row).toHaveTextContent('◂ Output');
      out.unmount();
      const io = setup({ node: nodeOf('nlaptop'), placed: portOf('nlaptop', 'usb1') });
      expect(io.row).toHaveTextContent('⇄ USB-C');
    });

    it('falls back to the connector name when there is no note', () => {
      const base = nodeOf('nscarlet');
      const noNote = { ...base, gear: { ...base.gear, ports: base.gear.ports.map((port) => ({ id: port.id, label: port.label, dir: port.dir, connector: port.connector })) } };
      const { row } = setup({ node: noNote });
      expect(row).toHaveTextContent('XLR/TRS combo');
      expect(row).not.toHaveTextContent('INST on');
    });

    it('is placed under the header at its row, with the row height', () => {
      const placed = portOf('nscarlet', 'in02');
      const { row } = setup({ placed });
      expect(row.style.top).toBe(`${GEO.headerH + placed.index * GEO.rowH}px`);
      expect(row.style.height).toBe(`${GEO.rowH}px`);
    });
  });

  describe('editable or not', () => {
    it('is a button named after the gear and the port, when editable', () => {
      setup();
      expect(screen.getByRole('button', { name: 'Focusrite Scarlett 18i8: Ch 2 · Bass, input, XLR/TRS combo, INST on' }).tagName).toBe('BUTTON');
    });

    it('says when the port is connected and when it is selected', () => {
      setup({ color: '#22c55e', isOrigin: true });
      expect(screen.getByRole('button', { name: /Ch 2.*, connected, selected$/ })).toBeInTheDocument();
    });

    it('does not claim to be connected or selected otherwise', () => {
      setup();
      const name = screen.getByRole('button').getAttribute('aria-label')!;
      expect(name).not.toContain('connected');
      expect(name).not.toContain('selected');
    });

    it('calls onClick when pressed', () => {
      const { props, row } = setup();
      fireEvent.click(row);
      expect(props.onClick).toHaveBeenCalledTimes(1);
    });

    it('is a plain row, not a button, when read-only, and keeps its description as a title', () => {
      const { row } = setup({ editable: false });
      expect(screen.queryByRole('button')).toBeNull();
      expect(row.tagName).toBe('DIV');
      expect(row).toHaveAttribute('title', expect.stringContaining('Ch 2 · Bass, input'));
    });
  });

  describe('the pin', () => {
    it('is the cable colour when connected, and the free-pin grey when not', () => {
      const connected = setup({ color: '#22c55e' });
      expect(connected.dot().style.backgroundColor).toBe('rgb(34, 197, 94)');
      connected.unmount();
      const free = setup();
      expect(free.dot().style.backgroundColor).toBe('rgb(71, 85, 105)'); // RIG_PALETTE.freePin
      expect(RIG_PALETTE.freePin).toBe('#475569');
    });

    it('sits on the left edge for a left-hand port and the right edge for a right-hand one', () => {
      const left = setup({ placed: { ...portOf('nscarlet', 'in02'), side: 'L' } });
      expect(left.dot().style.left).not.toBe('');
      expect(left.dot().style.right).toBe('');
      left.unmount();
      const right = setup({ placed: { ...portOf('nscarlet', 'in02'), side: 'R' } });
      expect(right.dot().style.right).not.toBe('');
      expect(right.dot().style.left).toBe('');
    });

    it('is hidden from assistive tech', () => {
      const { dot } = setup();
      expect(dot()).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('the plug (grab area of a connected pin)', () => {
    it('is absent without a handler', () => {
      const { plug } = setup({ color: '#22c55e' });
      expect(plug()).toBeNull();
    });

    it('is a grip, so touch and pen can start a drag from it', () => {
      const { plug } = setup({ color: '#22c55e', onPlugPointerDown: vi.fn() });
      expect(plug()).toHaveAttribute(DRAG_GRIP_ATTRIBUTE);
      expect(plug()).toHaveAttribute('aria-hidden', 'true');
      expect(plug()!.className).toContain('touch-none');
    });

    it('is bigger than the dot: GEO.plugHit square, centred on it', () => {
      const { plug, dot, row } = setup({ color: '#22c55e', onPlugPointerDown: vi.fn(), placed: { ...portOf('nscarlet', 'in02'), side: 'L' } });
      expect(plug()!.style.width).toBe(`${GEO.plugHit}px`);
      expect(plug()!.style.height).toBe(`${GEO.plugHit}px`);
      const grow = (GEO.plugHit - 14) / 2;
      expect(Number.parseFloat(plug()!.style.left)).toBe(Number.parseFloat(dot().style.left) - grow);
      // the plug is positioned in the card, the dot in its row (which has a 1px top border)
      expect(Number.parseFloat(plug()!.style.top)).toBe(Number.parseFloat(row.style.top) + 1 + Number.parseFloat(dot().style.top) - grow);
    });

    it('is on the same side as the dot', () => {
      const { plug } = setup({ color: '#22c55e', onPlugPointerDown: vi.fn(), placed: { ...portOf('nscarlet', 'in02'), side: 'R' } });
      expect(plug()!.style.right).not.toBe('');
      expect(plug()!.style.left).toBe('');
    });

    it('hands the pointer press to the handler, and does not click the port by itself', () => {
      const onPlugPointerDown = vi.fn();
      const { props, plug } = setup({ color: '#22c55e', onPlugPointerDown });
      fireEvent.pointerDown(plug()!, { clientX: 5, clientY: 6, pointerId: 1, button: 0 });
      expect(onPlugPointerDown).toHaveBeenCalledTimes(1);
      expect(props.onClick).not.toHaveBeenCalled();
    });
  });

  describe('highlighting', () => {
    it('is not dimmed or highlighted by default', () => {
      const { row } = setup();
      expect(row.className).not.toContain('opacity-50');
      expect(row.className).not.toContain('ring-sky-400');
      expect(row.className).not.toContain('ring-primary');
    });

    it('fades while a connection is in progress, unless it is the origin or can take it', () => {
      expect(setup({ connecting: true }).row.className).toContain('opacity-50');
      document.body.innerHTML = '';
      expect(setup({ connecting: true, isTarget: true }).row.className).not.toContain('opacity-50');
      document.body.innerHTML = '';
      expect(setup({ connecting: true, isOrigin: true }).row.className).not.toContain('opacity-50');
    });

    it('rings a valid target in sky and the origin in the primary colour', () => {
      const target = setup({ connecting: true, isTarget: true });
      expect(target.row.className).toContain('ring-sky-400');
      expect(target.row.className).not.toContain('ring-primary');
      document.body.innerHTML = '';
      const origin = setup({ connecting: true, isOrigin: true });
      expect(origin.row.className).toContain('ring-primary');
      expect(origin.row.className).not.toContain('ring-sky-400');
    });

    it('only an editable row reacts to the pointer', () => {
      expect(setup().row.className).toContain('hover:bg-surface-hover');
      document.body.innerHTML = '';
      expect(setup({ editable: false }).row.className).not.toContain('hover:bg-surface-hover');
    });
  });
});
