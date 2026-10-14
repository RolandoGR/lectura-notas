import { render } from 'preact';
import './styles.css';
import { App } from './app';

const mount = () => render(<App />, document.getElementById('app')!);

// Los símbolos del pentagrama salen de una fuente propia (recorte de Bravura): se espera a que
// cargue para no ver cuadros vacíos. Pesa unos pocos KB, así que la espera es mínima.
document.fonts.load('40px "Notas Glifos"', '').then(mount, mount);
