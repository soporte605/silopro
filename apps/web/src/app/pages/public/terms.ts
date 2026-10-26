import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TRIAL_DAYS } from '@silopro/domain';
import { LEGAL } from './legal-info';
import { LegalPage } from './legal-page';

/** Términos y condiciones de uso. Texto en docs/LEGAL.md para revisión. */
@Component({
  selector: 'sp-terms',
  imports: [LegalPage, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sp-legal-page title="Términos y condiciones">
      <p>
        Estos términos regulan el uso de SiloPro, servicio en línea de inventario que presta
        {{ legal.owner }} («ElikarSystems»). Al crear una cuenta o usar el servicio usted los acepta
        en nombre propio y de la organización que registra.
      </p>

      <h2>1. La cuenta</h2>
      <ul>
        <li>Debe dar datos verdaderos y un correo al que tenga acceso.</li>
        <li>
          Usted cuida su contraseña y responde por lo que se haga con su cuenta. Avísenos de
          inmediato si sospecha un acceso indebido.
        </li>
        <li>
          Quien crea la organización es su propietario: decide a quién invitar, qué rol tiene cada
          miembro y contrata el plan.
        </li>
      </ul>

      <h2>2. Prueba gratis</h2>
      <p>
        Cada organización nueva tiene {{ trialDays }} días de prueba sin costo y sin tarjeta, con
        los límites del plan Profesional. Al terminar, la organización queda en solo lectura: puede
        consultar y exportar su información, pero no modificarla hasta contratar un plan. No
        borramos datos por terminar la prueba.
      </p>

      <h2>3. Planes, precios y pagos</h2>
      <ul>
        <li>
          Los planes, límites y precios vigentes se publican en la
          <a class="underline" routerLink="/producto" fragment="precios">página de precios</a>. Los
          precios están en pesos mexicanos y no incluyen IVA.
        </li>
        <li>
          El pago es por adelantado, mensual o anual, con tarjeta a través de Stripe, y la
          suscripción se renueva automáticamente al final de cada periodo hasta que usted la
          cancele.
        </li>
        <li>
          Puede cancelar en cualquier momento desde «Plan y facturación». El plan sigue activo hasta
          el final del periodo pagado y no se hacen reembolsos por periodos parciales, salvo que la
          ley lo exija.
        </li>
        <li>
          Si un pago no se puede cobrar, Stripe lo reintentará; si la suscripción termina sin pago,
          la organización queda en solo lectura.
        </li>
        <li>
          Al exceder un límite de su plan (usuarios, artículos o espacio para fotografías) no podrá
          agregar más hasta liberar espacio o cambiar de plan; lo existente no se toca.
        </li>
        <li>
          Avisaremos con al menos 30 días de anticipación cualquier cambio de precio; aplicará a
          partir de su siguiente renovación.
        </li>
      </ul>

      <h2>4. Su información</h2>
      <p>
        El inventario, las fotografías y todo lo que su organización captura le pertenece. Nos
        autoriza a almacenarlo, respaldarlo y procesarlo solo para prestarle el servicio. Lo
        tratamos conforme al
        <a class="underline" routerLink="/privacidad">aviso de privacidad</a>. Puede exportarlo en
        cualquier momento y pedir que lo eliminemos.
      </p>

      <h2>5. Uso aceptable</h2>
      <p>No está permitido:</p>
      <ul>
        <li>Usar SiloPro para actividades ilícitas o guardar contenido ilegal.</li>
        <li>
          Intentar acceder a datos de otras organizaciones o vulnerar la seguridad del servicio.
        </li>
        <li>Sobrecargar el servicio de forma deliberada o automatizar su uso de forma abusiva.</li>
        <li>Revender el servicio sin un acuerdo por escrito con ElikarSystems.</li>
      </ul>
      <p>Podemos suspender una cuenta que incumpla estas reglas, avisándole cuando sea posible.</p>

      <h2>6. Disponibilidad y respaldos</h2>
      <p>
        Procuramos que SiloPro esté disponible todo el tiempo y respaldamos la información a diario,
        pero el servicio se ofrece «tal cual», sin garantía de disponibilidad ininterrumpida.
        Podemos hacer mantenimientos y mejoras, procurando avisar con anticipación los que
        interrumpan el servicio.
      </p>

      <h2>7. Responsabilidad</h2>
      <p>
        SiloPro es una herramienta de apoyo; las decisiones que usted tome con base en su
        información son suyas. En la medida que la ley lo permita, la responsabilidad total de
        ElikarSystems frente a usted se limita a lo que haya pagado por el servicio en los 12 meses
        anteriores al hecho que la origine, y no responde por daños indirectos ni lucro cesante.
      </p>

      <h2>8. Terminación</h2>
      <p>
        Usted puede dejar de usar SiloPro y pedir la eliminación de su organización cuando quiera.
        Si ElikarSystems decidiera dejar de ofrecer el servicio, le avisará con al menos 60 días
        para que exporte su información.
      </p>

      <h2>9. Cambios a estos términos</h2>
      <p>
        Publicaremos los cambios en esta página. Si son importantes, se los avisaremos por correo o
        dentro de la aplicación con anticipación; seguir usando SiloPro después implica aceptarlos.
      </p>

      <h2>10. Ley aplicable</h2>
      <p>
        Estos términos se rigen por las leyes de los Estados Unidos Mexicanos. Para cualquier
        controversia, las partes se someten a los tribunales de {{ legal.jurisdiction }}, sin
        perjuicio de los derechos que la Ley Federal de Protección al Consumidor le otorgue.
        Contacto: <a class="underline" [href]="'mailto:' + legal.email">{{ legal.email }}</a
        >.
      </p>
    </sp-legal-page>
  `,
})
export default class Terms {
  protected readonly legal = LEGAL;
  protected readonly trialDays = TRIAL_DAYS;
}
