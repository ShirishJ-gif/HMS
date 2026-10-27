import { useEffect, useState } from 'react';
import { reportingToday } from '../utils/reporting-period';

export function useReportingToday() {
  const [today, setToday] = useState(reportingToday);
  useEffect(() => {
    const update = () => setToday(reportingToday());
    const timer = window.setInterval(update, 30_000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return today;
}
