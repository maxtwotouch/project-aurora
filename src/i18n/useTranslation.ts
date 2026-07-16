// Importing the init module first (rather than importing react-i18next
// directly everywhere) guarantees i18next has been configured with our
// resources/device-locale detection before any screen calls the hook.
import './index';

export { useTranslation } from 'react-i18next';
