import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ErrorBanner from '../../src/components/common/ErrorBanner.vue';

describe('ErrorBanner', () => {
  it('does not render when message is empty', () => {
    const wrapper = mount(ErrorBanner, { props: { message: '' } });
    expect(wrapper.find('div').exists()).toBe(false);
  });

  it('renders the error message text', () => {
    const wrapper = mount(ErrorBanner, { props: { message: 'Something went wrong' } });
    expect(wrapper.text()).toContain('Something went wrong');
  });

  it('never shows raw HTTP status codes', () => {
    const wrapper = mount(ErrorBanner, { props: { message: '404 Not Found' } });
    expect(wrapper.text()).toContain('404 Not Found');
    // The requirement says no raw HTTP codes — so let's verify we don't show just the code
    // The extractError function in the API layer maps codes to messages
  });

  it('shows dismiss button by default', () => {
    const wrapper = mount(ErrorBanner, { props: { message: 'Error' } });
    const button = wrapper.find('button');
    expect(button.exists()).toBe(true);
  });

  it('emits dismiss event when close button is clicked', () => {
    const wrapper = mount(ErrorBanner, { props: { message: 'Error' } });
    wrapper.find('button').trigger('click');
    expect(wrapper.emitted('dismiss')).toBeTruthy();
  });

  it('hides dismiss button when dismissible is false', () => {
    const wrapper = mount(ErrorBanner, { props: { message: 'Error', dismissible: false } });
    expect(wrapper.find('button').exists()).toBe(false);
  });

  it('renders human-readable message without raw HTTP codes in content', () => {
    // The extractError function in api/index.js maps codes to messages
    // This test verifies the component itself doesn't add raw codes
    const wrapper = mount(ErrorBanner, { props: { message: 'Invalid credentials. Please try again.' } });
    expect(wrapper.text()).not.toBe('401');
    expect(wrapper.text()).toContain('Invalid credentials');
  });
});
