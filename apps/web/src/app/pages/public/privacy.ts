import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LEGAL } from './legal-info';
import { LegalPage } from './legal-page';

/** Aviso de privacidad integral (LFPDPPP). Texto en docs/LEGAL.md para revisión. */
@Component({
  selector: 'sp-privacy',
  imports: [LegalPage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sp-legal-page title="Aviso de privacidad">
      <h2>1. Responsable</h2>
      <p>
        {{ legal.owner }}, con domicilio en {{ legal.address }} («ElikarSystems»), es responsable
        del tratamiento de los datos personales que usted proporciona al usar SiloPro
        (app.silopro.elikarsystems.com), conforme a la Ley Federal de Protección de Datos Personales
        en Posesión de los Particulares. Contacto:
        <a class="underline" [href]="'mailto:' + legal.email">{{ legal.email }}</a
        >.
      </p>

      <h2>2. Datos que tratamos</h2>
      <ul>
        <li>
          <strong>Identificación y contacto:</strong> nombre, correo electrónico y nombre de su
          organización.
        </li>
        <li>
          <strong>Acceso y seguridad:</strong> contraseña (guardada solo como huella cifrada, nunca
          en texto), sesiones abiertas con el navegador usado, la dirección IP en los registros
          técnicos del servidor y el registro de cambios que cada miembro hace en el inventario.
        </li>
        <li>
          <strong>Facturación:</strong> plan contratado, estado de la suscripción y el identificador
          de cliente en Stripe. Los datos de su tarjeta los recibe y guarda Stripe; SiloPro no los
          ve ni los almacena.
        </li>
      </ul>
      <p>No solicitamos datos personales sensibles.</p>
      <p>
        La información de inventario, fotografías y demás contenido que su organización captura le
        pertenece. Si ese contenido incluye datos personales de terceros (por ejemplo, contactos de
        proveedores), su organización es responsable de ellos y ElikarSystems solo los trata por su
        cuenta para prestarle el servicio.
      </p>

      <h2>3. Para qué los usamos</h2>
      <p>Finalidades necesarias para el servicio:</p>
      <ul>
        <li>Crear y administrar su cuenta y su organización, e identificarle al iniciar sesión.</li>
        <li>Prestar SiloPro: guardar y mostrar su inventario a los miembros de su organización.</li>
        <li>
          Enviarle correos del servicio: confirmación de correo, recuperación de contraseña,
          invitaciones y avisos sobre su plan.
        </li>
        <li>Cobrar la suscripción y llevar el control de su plan.</li>
        <li>Proteger el servicio, prevenir abusos y atender solicitudes de soporte.</li>
        <li>Cumplir obligaciones legales y fiscales.</li>
      </ul>
      <p>
        No usamos sus datos para publicidad ni para otras finalidades. Si en el futuro quisiéramos
        enviarle novedades del producto, se lo pediremos antes y podrá negarse en cualquier momento.
      </p>

      <h2>4. Con quién los compartimos</h2>
      <p>
        No vendemos ni cedemos sus datos. Para prestar el servicio usamos proveedores que los tratan
        por nuestra cuenta y bajo nuestras instrucciones:
      </p>
      <ul>
        <li><strong>Stripe</strong>, para procesar pagos y suscripciones.</li>
        <li><strong>Resend</strong>, para enviar los correos del servicio.</li>
        <li><strong>Contabo</strong>, proveedor del servidor donde se aloja SiloPro.</li>
        <li><strong>Cloudflare</strong>, para guardar copias de respaldo cifradas.</li>
      </ul>
      <p>
        Algunos de estos proveedores pueden tratar los datos fuera de México. Solo comunicaremos sus
        datos a autoridades cuando una ley o un mandato de autoridad competente lo exija.
      </p>

      <h2>5. Cookies y almacenamiento del navegador</h2>
      <p>
        SiloPro usa una sola cookie, necesaria para mantener su sesión, y el almacenamiento local
        del navegador para recordar preferencias como el tema o la organización activa. No usamos
        cookies de publicidad ni de analítica de terceros.
      </p>

      <h2>6. Cuánto tiempo los conservamos</h2>
      <p>
        Mientras su cuenta exista. Si la prueba termina o la suscripción se cancela, la organización
        queda en solo lectura y sus datos se conservan hasta que usted pida eliminarlos. Al recibir
        la solicitud los borramos del servicio; las copias de respaldo se sobrescriben en un plazo
        de hasta 30 días. Conservaremos los datos de facturación que la ley fiscal obligue a
        guardar.
      </p>

      <h2>7. Sus derechos (ARCO) y cómo revocar el consentimiento</h2>
      <p>
        Usted puede acceder a sus datos, rectificarlos, cancelarlos u oponerse a su tratamiento, así
        como revocar su consentimiento o limitar su uso, escribiendo a
        <a class="underline" [href]="'mailto:' + legal.email">{{ legal.email }}</a> desde el correo
        de su cuenta. Su solicitud debe indicar:
      </p>
      <ul>
        <li>Su nombre y el correo de su cuenta.</li>
        <li>Un documento que acredite su identidad o, en su caso, la de su representante.</li>
        <li>Qué derecho quiere ejercer y sobre qué datos.</li>
        <li>Cualquier documento que facilite ubicar sus datos.</li>
      </ul>
      <p>
        Le responderemos en un máximo de 20 días hábiles y, si procede, la haremos efectiva dentro
        de los 15 días hábiles siguientes. Muchos datos puede corregirlos usted mismo en la
        aplicación. Si considera que su derecho no fue atendido, puede acudir a la autoridad de
        protección de datos personales.
      </p>

      <h2>8. Cambios a este aviso</h2>
      <p>
        Publicaremos cualquier cambio en esta página con su fecha de actualización. Si el cambio es
        importante, también se lo avisaremos por correo o dentro de la aplicación.
      </p>
    </sp-legal-page>
  `,
})
export default class Privacy {
  protected readonly legal = LEGAL;
}
