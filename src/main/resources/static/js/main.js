import { ModelStore } from './core/model.js';
import { ModelEditor } from './modeling/model-editor.js';
import { SimulationView } from './simulation/simulation-view.js';
import { FlightView } from './flight/flight-view.js';
import { AxisGizmo } from './core/axis-gizmo.js';

class AerolabApp {
  constructor() {
    this.store = new ModelStore();
    this.view = null;
    this.activeView = null;
    this.viewportHost = document.querySelector('#viewport');
    this.overlayHost = document.querySelector('#view-overlay');
    this.headerActions = document.querySelector('#header-actions');
    this.headerKicker = document.querySelector('#header-kicker');
    this.headerTitle = document.querySelector('#header-title');
    this.headerContext = document.querySelector('#header-context');
    this.stage = document.querySelector('#stage');
    this.axisGizmo = new AxisGizmo(document.querySelector('#axis-gizmo'));
    this.store.subscribe(() => this._updateModelContext());
  }

  start() {
    document.querySelectorAll('[data-view]').forEach(button => {
      button.addEventListener('click', () => this.activate(button.dataset.view));
    });
    window.addEventListener('beforeunload', () => this.store.flush());
    this._renderAxis = () => {
      const camera = this.view?.viewport?.camera ?? this.view?.scene?.viewport?.camera;
      if (camera) this.axisGizmo.render(camera);
      this._axisFrame = requestAnimationFrame(this._renderAxis);
    };
    this._axisFrame = requestAnimationFrame(this._renderAxis);
    this.activate('modeling');
    document.querySelector('#boot-screen')?.classList.add('is-dismissed');
    setTimeout(() => document.querySelector('#boot-screen')?.remove(), 650);
  }

  activate(name) {
    if (!['modeling', 'simulation', 'flight'].includes(name)) return;
    if (this.activeView === name && this.view) return;

    this.view?.dispose?.();
    this.view = null;
    this.activeView = name;
    this.overlayHost.replaceChildren();
    this.headerActions.replaceChildren();
    this.headerActions.onclick = null;

    document.querySelectorAll('[data-view]').forEach(button => {
      const active = button.dataset.view === name;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
    this.stage.dataset.mode = name;

    if (name === 'modeling') {
      this.headerKicker.textContent = 'Geometry Workbench';
      this.headerTitle.textContent = '几何建模';
      this.view = new ModelEditor({
        container: this.viewportHost,
        overlay: this.overlayHost,
        headerActions: this.headerActions,
        store: this.store,
        onSimulation: () => this.activate('simulation'),
        onFlight: () => this.activate('flight')
      });
    } else if (name === 'simulation') {
      this.headerKicker.textContent = 'Wind Tunnel Analysis';
      this.headerTitle.textContent = '气动模拟';
      this.view = new SimulationView({
        container: this.viewportHost,
        overlay: this.overlayHost,
        headerActions: this.headerActions,
        store: this.store,
        onBack: () => this.activate('modeling')
      });
    } else {
      this.headerKicker.textContent = 'Procedural Flight World';
      this.headerTitle.textContent = '虚拟驾驶';
      this.view = new FlightView({
        container: this.viewportHost,
        overlay: this.overlayHost,
        headerActions: this.headerActions,
        store: this.store,
        onExit: () => this.activate('modeling')
      });
    }

    this._updateModelContext();
    document.title = `${this.headerTitle.textContent} · AEROLAB`;
    this.stage.animate(
      [
        { opacity: 0.35, transform: 'scale(1.004)' },
        { opacity: 1, transform: 'scale(1)' }
      ],
      { duration: 380, easing: 'cubic-bezier(.2,.75,.25,1)' }
    );
  }

  _updateModelContext() {
    if (!this.headerContext) return;
    const count = this.store.model.parts.length;
    const name = this.store.model.name?.trim() || '未命名模型';
    this.headerContext.textContent = `${name.toUpperCase()} · ${count} 部件`;
  }
}

const app = new AerolabApp();
app.start();
