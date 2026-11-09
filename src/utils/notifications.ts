import { FactoryProfile, IndustrialLaw, LawAlertNotification } from '../types/law';
import { playAlertSound } from './sound';

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    return false;
  }
  if (Notification.permission === 'granted') {
    return true;
  }
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  return false;
}

export function isLawMatchedWithFactory(law: IndustrialLaw, factory: FactoryProfile): boolean {
  const criteria = law.applicableCriteria;
  if (!criteria) return true;

  if (criteria.hasBoiler && !factory.hasBoiler) return false;
  if (criteria.hasHazardousChemicals && !factory.hasHazardousChemicals) return false;
  if (criteria.hasWastewater && !factory.hasWastewaterTreatment) return false;
  if (criteria.hasAirEmissions && !factory.hasAirEmissionStack) return false;

  if (criteria.minHorsepower && factory.horsepower < criteria.minHorsepower) return false;
  if (criteria.minEmployees && factory.employeeCount < criteria.minEmployees) return false;

  return true;
}

export function sendBrowserNotification(
  alert: LawAlertNotification,
  soundEnabled = true
) {
  if (soundEnabled) {
    playAlertSound(alert.urgency === 'critical' ? 'urgent' : 'info');
  }

  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(`[เรดาร์กฎหมายโรงงาน] ${alert.title}`, {
        body: `${alert.message}\nแนวทางแก้ไข: ${alert.actionRequired}`,
        icon: '/favicon.ico',
        tag: alert.id,
      });
    } catch (e) {
      console.warn('Native notification failed:', e);
    }
  }
}
