// Simplified Auto-fill Content Script - Reliable Stripe Payment Form Filler
class AutoFillManager {
  constructor() {
    this.isEnabled = true;
    this.isActivatingTrial = false;
    this.cardIndex = 0;
    this.cards = [];
    this.generatedData = null;
    this.isGeneratingData = false;
    this.formFilledSuccessfully = false;
    this.waitingForStripeResponse = false;
    this.lastSubmitTime = 0;

    // Stripe field selectors - Direct IDs for reliability
    this.STRIPE_SELECTORS = {
      CARD_NUMBER: "#cardNumber",
      CARD_EXPIRY: "#cardExpiry",
      CARD_MONTH:
        '#cardMonth, #expiryMonth, [name*="month"], [placeholder*="MM"]',
      CARD_YEAR:
        '#cardYear, #expiryYear, [name*="year"], [placeholder*="YY"], [placeholder*="YYYY"]',
      CARD_CVC:
        '#cardCvc, #cvc, #cvv, [name*="cvc"], [name*="cvv"], [placeholder*="CVC"], [placeholder*="CVV"], [placeholder*="Security"]',
      BILLING_NAME: "#billingName",
      BILLING_COUNTRY: "#billingCountry",
      BILLING_ADDRESS: "#billingAddressLine1",
      BILLING_POSTAL: "#billingPostalCode",
      BILLING_CITY: "#billingLocality",
      SUBMIT_BUTTON:
        'button[type="submit"], button.SubmitButton, button[data-testid="hosted-payment-submit-button"], [role="button"][data-testid*="submit"], .SubmitButton--complete, .SubmitButton--pre, .SubmitButton--processing, button[class*="SubmitButton"]',
      CARD_SECTION_TOGGLE: '[data-testid="card-accordion-item-button"]',
    };

    this.setupMessageListener();
    this.setupFormSubmitHandler();
    this.loadStoredData();

    console.log("✅ AutoFillManager initialized - Ready for manual activation");
  }

  // 加载存储的支付数据
  async loadStoredData() {
    try {
      const result = await chrome.storage.local.get('generatedPaymentData');
      if (result.generatedPaymentData) {
        this.generatedData = result.generatedPaymentData;
        console.log("📋 已加载存储的支付数据");
      }
    } catch (error) {
      console.log("⚠️ 加载存储数据失败:", error);
    }
  }

  // Setup form submit event handler
  setupFormSubmitHandler() {
    document.addEventListener("DOMContentLoaded", () => {
      // Wait for forms to be available
      setTimeout(() => {
        const forms = document.querySelectorAll("form");
        forms.forEach((form) => {
          form.addEventListener("submit", (event) => {
            console.log("📤 Form submit event detected");
            // Allow the default form submission to proceed
            // This ensures compatibility with Stripe's payment processing
          });
        });
      }, 1000);
    });
  }

  // Setup message listener for communication with extension
  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log("📨 收到消息:", message.type);
      
      switch (message.type) {
        case "fillPaymentForm":
          // 使用存储的数据或消息中的数据
          this.fillPaymentFormManual()
            .then(() => {
              sendResponse({ success: true });
            })
            .catch((error) => {
              console.error("填充表单错误:", error);
              sendResponse({ success: false, error: error.message });
            });
          return true; // 保持消息通道开启

        case "submitPaymentForm":
          this.submitFormImmediately()
            .then(() => {
              sendResponse({ success: true });
            })
            .catch((error) => {
              console.error("提交表单错误:", error);
              sendResponse({ success: false, error: error.message });
            });
          return true;

        case "activateProTrial":
          this.activateProTrial()
            .then(() => {
              sendResponse({ success: true });
            })
            .catch((error) => {
              console.error("Activate pro trial error:", error);
              sendResponse({ success: false, error: error.message });
            });
          return true;

        case "startProTrialActivation":
          this.startProTrialActivation(message.cards)
            .then(() => {
              sendResponse({ success: true });
            })
            .catch((error) => {
              console.error("Start pro trial activation error:", error);
              sendResponse({ success: false, error: error.message });
            });
          break;

        case "checkForPaymentForms":
          const forms = this.detectPaymentForms();
          sendResponse({ formsFound: forms.length > 0, forms: forms });
          break;

        case "stripe-response":
          this.handleStripeResponse(message);
          sendResponse({ success: true });
          break;
      }
      return true; // Keep message channel open for async responses
    });
  }

  // Detect payment forms on the page
  detectPaymentForms() {
    const forms = [];

    // Check for Stripe elements
    const stripeElements = document.querySelectorAll(
      '#cardNumber, #cardExpiry, #cardCvc, [data-testid*="card"], [id*="card"], [name*="card"]'
    );

    if (stripeElements.length > 0) {
      forms.push({
        type: "stripe",
        elements: stripeElements.length,
        detected: true,
      });
    }

    // Check for trial buttons using safe selectors
    const buttons = document.querySelectorAll('button, a[role="button"]');
    let trialButton = null;

    for (const button of buttons) {
      const text = button.textContent?.toLowerCase() || "";
      if (
        (text.includes("start") && text.includes("trial")) ||
        (text.includes("14") && text.includes("day")) ||
        text.includes("continue")
      ) {
        trialButton = button;
        break;
      }
    }

    if (trialButton) {
      forms.push({
        type: "cursor-pro-trial",
        button: trialButton,
        detected: true,
      });
    }

    console.log("✅ Payment forms detected:", forms);
    return forms;
  }

  // Activate Pro Trial flow
  async activateProTrial() {
    console.log("🚀 Starting Pro Trial activation on:", window.location.href);

    // Step 1: Generate data FIRST (as requested by user)
    console.log("📋 Step 1: Generating payment data...");
    const paymentData = await this.generatePaymentData();
    if (!paymentData) {
      throw new Error("Failed to generate payment data");
    }
    console.log("✅ Payment data generated");

    if (window.location.href.includes("checkout.stripe.com")) {
      // Step 2: Fill Stripe form
      console.log("💳 Step 2: Filling Stripe checkout form...");
      return await this.fillStripeForm(paymentData);
    } else if (window.location.href.includes("cursor.com")) {
      // Step 2: Find and click trial button
      console.log("🔍 Step 2: Looking for trial button...");
      const buttonClicked = await this.findAndClickTrialButton();

      if (buttonClicked) {
        console.log("✅ Trial button clicked, waiting for redirect...");
        // Store data for when we reach Stripe
        this.generatedData = paymentData;
        return true;
      } else {
        // Navigate to dashboard if button not found
        console.log("🏠 Navigating to dashboard...");
        window.location.href = "https://cursor.com/dashboard";
        return true;
      }
    }

    throw new Error("Unknown page type for Pro Trial activation");
  }

  // Generate payment data using the extension's generator
  async generatePaymentData() {
    if (this.isGeneratingData && this.generatedData) {
      console.log("📋 Using cached payment data");
      return this.generatedData;
    }

    this.isGeneratingData = true;
    console.log("🎲 Requesting payment data generation...");

    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            type: "generatePaymentData",
            options: {},
          },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (response?.success === false) {
              reject(
                new Error(response.error || "Failed to generate payment data")
              );
            } else {
              resolve(response);
            }
          }
        );
      });

      this.generatedData = response.data;
      console.log("✅ Payment data generated successfully");
      return this.generatedData;
    } catch (error) {
      console.error("❌ Failed to generate payment data:", error);
      throw error;
    } finally {
      this.isGeneratingData = false;
    }
  }

  // Find and click trial button
  async findAndClickTrialButton() {
    console.log("🔍 Searching for trial button...");

    // Wait for page to load
    await this.waitForPageLoad();

    // Search for trial buttons with various selectors
    const buttonSelectors = [
      'button[data-testid*="trial"]',
      'button[class*="trial"]',
      'button[id*="trial"]',
      'a[href*="trial"]',
      "button",
      'a[role="button"]',
    ];

    for (const selector of buttonSelectors) {
      try {
        const buttons = document.querySelectorAll(selector);
        console.log(
          `🔍 Checking ${buttons.length} buttons with selector: ${selector}`
        );

        for (const button of buttons) {
          const buttonText = button.textContent?.toLowerCase()?.trim() || "";

          // Check for trial-related text
          if (
            (buttonText.includes("start") &&
              (buttonText.includes("trial") || buttonText.includes("14"))) ||
            (buttonText.includes("continue") &&
              window.location.pathname.includes("/trial"))
          ) {
            console.log("✅ Found trial button:", buttonText);
            this.clickButton(button);
            return true;
          }
        }
      } catch (e) {
        console.log(`⚠️ Selector failed: ${selector}`, e);
        continue;
      }
    }

    console.log("❌ No trial button found");
    return false;
  }

  // Simple button click with multiple event types
  clickButton(button) {
    console.log("🖱️ Clicking button:", button.textContent);

    // Scroll into view
    button.scrollIntoView({ behavior: "smooth", block: "center" });

    setTimeout(() => {
      // Focus first
      button.focus();

      // Multiple click events for compatibility
      button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      // Direct click as backup
      try {
        button.click();
      } catch (e) {
        console.log("⚠️ Direct click failed:", e);
      }
    }, 300);
  }

  // Fill Stripe payment form - SIMPLIFIED APPROACH
  async fillStripeForm(data) {
    // Prevent refilling if form was already filled successfully and we're waiting for response
    if (this.formFilledSuccessfully && this.waitingForStripeResponse) {
      console.log(
        "⚠️ Form already filled successfully, waiting for Stripe response..."
      );
      return true;
    }

    console.log("💳 Starting Stripe form fill...");
    console.log("📋 Using data:", {
      cardCount: data.cards?.length,
      name: data.name,
      hasAddress: !!data.address,
    });

    try {
      // Step 1: Wait for and activate card inputs
      console.log("⏳ Step 1: Waiting for card inputs...");
      const inputsReady = await this.waitForCardInputs();
      if (!inputsReady) {
        throw new Error("Card inputs not available after waiting");
      }

      // Step 2: Get current card data
      const currentCard = data.cards[this.cardIndex] || data.cards[0];
      if (!currentCard) {
        throw new Error("No card data available");
      }
      console.log("🎯 Using card:", currentCard);

      // Step 3: Fill card fields ONE BY ONE with verification
      console.log("💳 Step 3: Filling card fields...");

      // Fill card number
      const cardNumberField = document.querySelector(
        this.STRIPE_SELECTORS.CARD_NUMBER
      );
      if (cardNumberField) {
        const success1 = await this.fillFieldReliably(
          cardNumberField,
          currentCard.number,
          "Card Number"
        );
        if (!success1) throw new Error("Failed to fill card number");
      }

      // Fill expiry - try combined field first, then separate fields
      let expirySuccess = await this.fillExpiryFields(currentCard);
      if (!expirySuccess) {
        console.log("⚠️ Expiry fields failed, but continuing with CVC...");
      }

      // Fill CVC with multiple selector attempts
      let cvcSuccess = await this.fillCvcField(currentCard.cvv);
      if (!cvcSuccess) {
        console.log("⚠️ CVC field failed, but continuing...");
      }

      // Step 4: Fill billing info
      console.log("🏠 Step 4: Filling billing info...");
      await this.fillBillingInfo(data);

      // Step 5: Final validation and submit
      console.log("🔍 Step 5: Final validation...");
      await this.wait(1000); // Let Stripe validate

      const isValid = await this.validateForm();
      if (!isValid) {
        throw new Error("Form validation failed");
      }

      console.log("✅ Stripe form filled successfully!");

      // Mark form as filled BEFORE submitting to prevent re-filling
      this.formFilledSuccessfully = true;
      this.waitingForStripeResponse = true;
      this.lastSubmitTime = Date.now();

      // Step 6: Submit form IMMEDIATELY
      console.log("📤 Step 6: Submitting form IMMEDIATELY...");
      const submitResult = await this.submitFormImmediately();

      if (submitResult) {
        console.log(
          "✅ Form submitted successfully, monitoring for response..."
        );
        // Setup error monitoring after successful submission
        this.setupStripeErrorMonitoring();
      } else {
        // Reset flags if submission failed
        this.formFilledSuccessfully = false;
        this.waitingForStripeResponse = false;
      }

      return submitResult;
    } catch (error) {
      console.error("❌ Stripe form fill failed:", error);
      this.showTrialStatus(
        `❌ Failed to fill payment form: ${error.message}`,
        "error"
      );
      return false;
    }
  }

  // Wait for card inputs to be available
  async waitForCardInputs() {
    console.log("⏳ Waiting for card inputs...");

    // First try to activate card section
    const cardToggle = document.querySelector(
      this.STRIPE_SELECTORS.CARD_SECTION_TOGGLE
    );
    if (cardToggle) {
      console.log("🖱️ Clicking card section toggle...");
      cardToggle.click();
      await this.wait(1000);
    }

    // Wait for inputs to appear
    for (let i = 0; i < 30; i++) {
      const cardNumber = document.querySelector(
        this.STRIPE_SELECTORS.CARD_NUMBER
      );
      const cardExpiry = document.querySelector(
        this.STRIPE_SELECTORS.CARD_EXPIRY
      );
      const cardMonth = document.querySelector(
        this.STRIPE_SELECTORS.CARD_MONTH
      );
      const cardYear = document.querySelector(this.STRIPE_SELECTORS.CARD_YEAR);
      const cardCvc = document.querySelector(this.STRIPE_SELECTORS.CARD_CVC);

      // Check for either combined expiry field OR separate month/year fields
      const hasExpiryField =
        (cardExpiry && this.isFieldReady(cardExpiry)) ||
        (cardMonth &&
          cardYear &&
          this.isFieldReady(cardMonth) &&
          this.isFieldReady(cardYear));

      if (cardNumber && cardCvc && hasExpiryField) {
        // Also check if they're visible and enabled
        if (this.isFieldReady(cardNumber) && this.isFieldReady(cardCvc)) {
          console.log("✅ All card inputs are ready");
          return true;
        }
      }

      await this.wait(200);
    }

    console.log("❌ Card inputs not ready after waiting");
    return false;
  }

  // Check if field is ready for input
  isFieldReady(field) {
    if (!field) return false;
    return (
      field.offsetWidth > 0 &&
      field.offsetHeight > 0 &&
      !field.disabled &&
      !field.readOnly
    );
  }

  // Fill field reliably with multiple methods (Enhanced for Stripe)
  async fillFieldReliably(field, value, fieldName) {
    if (!field || !value) {
      console.log(`❌ ${fieldName}: Invalid field or value`);
      return false;
    }

    console.log(`🎯 Filling ${fieldName} with: "${value}"`);

    // Activate the field
    await this.activateField(field);

    // Check if this is a Stripe CheckoutInput field
    const isStripeCheckoutInput =
      field.classList.contains("CheckoutInput") ||
      field.classList.contains("Input") ||
      field.id === "billingName" ||
      field.name === "billingName";

    if (isStripeCheckoutInput) {
      // Special handling for Stripe CheckoutInput fields
      console.log(`💳 Detected Stripe CheckoutInput field: ${fieldName}`);

      // Clear the field first
      field.value = "";
      field.dispatchEvent(new Event("input", { bubbles: true }));
      await this.wait(50);

      // Set the value
      field.value = value;

      // Trigger multiple events for Stripe compatibility
      const events = ["input", "change", "blur", "keyup"];
      for (const eventType of events) {
        const event = new Event(eventType, { bubbles: true, cancelable: true });
        field.dispatchEvent(event);
        await this.wait(10);
      }

      // Verify the value was set
      await this.wait(100);
      if (field.value === value) {
        console.log(`✅ ${fieldName} filled successfully (Stripe method)`);
        return true;
      }
    }

    // Special handling for card number with spaces (Stripe format)
    if (fieldName.includes("Card Number")) {
      // Try without formatting first
      const cleanValue = value.replace(/\s/g, "");

      // Method 1: Clean number
      field.value = cleanValue;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      await this.wait(100);

      // Check if Stripe formatted it automatically
      if (field.value.replace(/\s/g, "") === cleanValue) {
        console.log(`✅ ${fieldName} filled successfully (Clean)`);
        field.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }

      // Method 2: Character by character for card numbers
      console.log(`🔄 ${fieldName} trying character input...`);
      field.value = "";
      field.dispatchEvent(new Event("input", { bubbles: true }));

      for (let i = 0; i < cleanValue.length; i++) {
        const currentValue = field.value.replace(/\s/g, "") + cleanValue[i];
        field.value = currentValue;

        // Trigger input events to let Stripe format
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("keyup", { bubbles: true }));
        await this.wait(50);
      }

      field.dispatchEvent(new Event("change", { bubbles: true }));
      await this.wait(200);

      if (field.value.replace(/\s/g, "") === cleanValue) {
        console.log(`✅ ${fieldName} filled successfully (Character)`);
        return true;
      }

      // Method 3: Native setter with React handling
      console.log(`🔄 ${fieldName} trying React-aware method...`);
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set;
      if (nativeSetter) {
        nativeSetter.call(field, cleanValue);

        // Trigger React events
        const inputEvent = new Event("input", { bubbles: true });
        Object.defineProperty(inputEvent, "target", {
          value: field,
          enumerable: true,
        });
        field.dispatchEvent(inputEvent);

        await this.wait(100);
        field.dispatchEvent(new Event("change", { bubbles: true }));
        await this.wait(200);

        if (field.value.replace(/\s/g, "") === cleanValue) {
          console.log(`✅ ${fieldName} filled successfully (React)`);
          return true;
        }
      }

      console.log(
        `⚠️ ${fieldName} partially filled. Expected: "${cleanValue}", Got: "${field.value.replace(
          /\s/g,
          ""
        )}"`
      );
      // Consider partial success if most digits are there
      return field.value.replace(/\s/g, "").length >= 15;
    }

    // Standard method for other fields
    // Method 1: Simple direct assignment
    field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    await this.wait(300);

    // Check if it worked
    if (field.value === value) {
      console.log(`✅ ${fieldName} filled successfully (Method 1)`);
      return true;
    }

    // Method 2: Character by character
    console.log(
      `🔄 ${fieldName} Method 1 failed, trying character-by-character...`
    );
    field.value = "";
    field.dispatchEvent(new Event("input", { bubbles: true }));

    for (let i = 0; i < value.length; i++) {
      field.value += value[i];
      field.dispatchEvent(new Event("input", { bubbles: true }));
      await this.wait(20);
    }

    field.dispatchEvent(new Event("change", { bubbles: true }));
    await this.wait(300);

    if (field.value === value) {
      console.log(`✅ ${fieldName} filled successfully (Method 2)`);
      return true;
    }

    // Method 3: Native value setter
    console.log(`🔄 ${fieldName} Method 2 failed, trying native setter...`);
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    ).set;
    if (nativeSetter) {
      nativeSetter.call(field, "");
      field.dispatchEvent(new Event("input", { bubbles: true }));
      nativeSetter.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
      await this.wait(300);

      if (field.value === value) {
        console.log(`✅ ${fieldName} filled successfully (Method 3)`);
        return true;
      }
    }

    console.log(
      `❌ ${fieldName} failed to fill with all methods. Final value: "${field.value}"`
    );
    return false;
  }

  // Fill expiry fields - try combined field first, then separate fields
  async fillExpiryFields(card) {
    console.log("📅 Filling expiry fields...");

    // Try combined expiry field first
    const cardExpiryField = document.querySelector(
      this.STRIPE_SELECTORS.CARD_EXPIRY
    );
    if (cardExpiryField && this.isFieldReady(cardExpiryField)) {
      const expiryValue = `${card.month.toString().padStart(2, "0")} / ${
        card.year
      }`;
      const success = await this.fillFieldReliably(
        cardExpiryField,
        expiryValue,
        "Card Expiry (Combined)"
      );
      if (success) return true;

      // Try alternative format
      const altValue = `${card.month.toString().padStart(2, "0")}${card.year}`;
      const success2 = await this.fillFieldReliably(
        cardExpiryField,
        altValue,
        "Card Expiry (MMYY)"
      );
      if (success2) return true;
    }

    // Try separate month and year fields
    const cardMonthField = document.querySelector(
      this.STRIPE_SELECTORS.CARD_MONTH
    );
    const cardYearField = document.querySelector(
      this.STRIPE_SELECTORS.CARD_YEAR
    );

    if (cardMonthField && cardYearField) {
      console.log("📅 Trying separate month/year fields...");

      const monthSuccess = await this.fillFieldReliably(
        cardMonthField,
        card.month.toString().padStart(2, "0"),
        "Card Month"
      );
      await this.wait(200);

      // For year field, try both 2-digit and 4-digit formats
      let yearSuccess = false;
      const yearValue2 = card.year.toString().slice(-2);
      const yearValue4 = `20${card.year}`;

      yearSuccess = await this.fillFieldReliably(
        cardYearField,
        yearValue2,
        "Card Year (YY)"
      );
      if (!yearSuccess) {
        yearSuccess = await this.fillFieldReliably(
          cardYearField,
          yearValue4,
          "Card Year (YYYY)"
        );
      }

      return monthSuccess && yearSuccess;
    }

    console.log("❌ No expiry fields found");
    return false;
  }

  // Fill CVC field with multiple attempts
  async fillCvcField(cvv) {
    console.log("🔒 Filling CVC field...");

    // Try multiple selectors for CVC field
    const cvcSelectors = this.STRIPE_SELECTORS.CARD_CVC.split(", ");

    for (const selector of cvcSelectors) {
      const cvcField = document.querySelector(selector);
      if (cvcField && this.isFieldReady(cvcField)) {
        console.log(`🔒 Found CVC field with selector: ${selector}`);
        const success = await this.fillFieldReliably(
          cvcField,
          cvv,
          `CVC (${selector})`
        );
        if (success) return true;
      }
    }

    console.log("❌ No CVC field found or filled successfully");
    return false;
  }

  // Activate field for input
  async activateField(field) {
    // Scroll into view
    field.scrollIntoView({ behavior: "instant", block: "center" });
    await this.wait(100);

    // Click and focus multiple times
    for (let i = 0; i < 3; i++) {
      field.click();
      field.focus();
      await this.wait(50);
    }
  }

  // Fill billing information
  async fillBillingInfo(data) {
    if (!data.address || !data.name) {
      console.log("⚠️ No billing info to fill");
      return;
    }

    console.log("🏠 Filling billing information...");

    // Fill name
    const nameField = document.querySelector(
      this.STRIPE_SELECTORS.BILLING_NAME
    );
    if (nameField) {
      await this.fillFieldReliably(nameField, data.name, "Billing Name");
    }

    // Fill country (special handling for select)
    const countryField = document.querySelector(
      this.STRIPE_SELECTORS.BILLING_COUNTRY
    );
    if (countryField) {
      countryField.value = data.address.country || "US";
      countryField.dispatchEvent(new Event("change", { bubbles: true }));
      await this.wait(200);
    }

    // Fill address
    const addressField = document.querySelector(
      this.STRIPE_SELECTORS.BILLING_ADDRESS
    );
    if (addressField) {
      await this.fillFieldReliably(
        addressField,
        data.address.street,
        "Billing Address"
      );
    }

    // Fill postal code
    const postalField = document.querySelector(
      this.STRIPE_SELECTORS.BILLING_POSTAL
    );
    if (postalField) {
      await this.fillFieldReliably(
        postalField,
        data.address.postalCode,
        "Postal Code"
      );
    }

    // Fill city
    const cityField = document.querySelector(
      this.STRIPE_SELECTORS.BILLING_CITY
    );
    if (cityField) {
      await this.fillFieldReliably(cityField, data.address.city, "City");
    }

    console.log("✅ Billing info filled");
  }

  // Validate form before submission
  async validateForm() {
    console.log("🔍 Validating form...");

    const cardNumber = document.querySelector(
      this.STRIPE_SELECTORS.CARD_NUMBER
    );
    const cardExpiry = document.querySelector(
      this.STRIPE_SELECTORS.CARD_EXPIRY
    );
    const cardMonth = document.querySelector(this.STRIPE_SELECTORS.CARD_MONTH);
    const cardYear = document.querySelector(this.STRIPE_SELECTORS.CARD_YEAR);
    const cardCvc = document.querySelector(this.STRIPE_SELECTORS.CARD_CVC);
    const billingName = document.querySelector(
      this.STRIPE_SELECTORS.BILLING_NAME
    );

    console.log("📋 Field validation details:");

    // Check required card fields
    const cardNumberValue = cardNumber?.value?.replace(/\s/g, "") || "";
    console.log(
      `  - Card Number: "${cardNumber?.value}" (clean: "${cardNumberValue}", length: ${cardNumberValue.length})`
    );
    if (!cardNumberValue || cardNumberValue.length < 16) {
      console.log(
        `❌ Card number invalid: needs 16 digits, got ${cardNumberValue.length}`
      );
      return false;
    }

    // Check billing name
    console.log(
      `  - Billing Name: "${billingName?.value || "NOT FOUND"}" (length: ${
        billingName?.value?.length || 0
      })`
    );
    if (!billingName?.value || billingName.value.trim().length < 2) {
      console.log(`❌ Billing name invalid or missing`);
      return false;
    }

    // Validate expiry (either combined field or separate fields)
    let expiryValid = false;
    console.log(
      `  - Card Expiry Combined: "${cardExpiry?.value || "NOT FOUND"}"`
    );
    console.log(`  - Card Month: "${cardMonth?.value || "NOT FOUND"}"`);
    console.log(`  - Card Year: "${cardYear?.value || "NOT FOUND"}"`);

    if (cardExpiry?.value && cardExpiry.value.length >= 5) {
      expiryValid = true;
      console.log(`  ✅ Expiry valid (combined field)`);
    } else if (cardMonth?.value && cardYear?.value) {
      // Check if month is valid (01-12)
      const month = parseInt(cardMonth.value);
      const year = parseInt(cardYear.value);
      if (month >= 1 && month <= 12 && year > 0) {
        expiryValid = true;
        console.log(`  ✅ Expiry valid (separate fields: ${month}/${year})`);
      }
    }

    if (!expiryValid) {
      console.log(`❌ Card expiry invalid`);
      return false;
    }

    // Find CVC field with multiple selectors
    let cvcField = null;
    const cvcSelectors = this.STRIPE_SELECTORS.CARD_CVC.split(", ");
    for (const selector of cvcSelectors) {
      const field = document.querySelector(selector);
      if (field && field.value) {
        cvcField = field;
        break;
      }
    }

    console.log(
      `  - Card CVC: "${cvcField?.value || "NOT FOUND"}" (length: ${
        cvcField?.value?.length || 0
      })`
    );
    if (!cvcField?.value || cvcField.value.length < 3) {
      console.log(
        `❌ Card CVC invalid: needs 3+ digits, got ${
          cvcField?.value?.length || 0
        }`
      );
      return false;
    }

    // Check for Stripe validation errors
    const errorElements = document.querySelectorAll('[aria-invalid="true"]');
    if (errorElements.length > 0) {
      console.log(`❌ Form has ${errorElements.length} validation errors:`);
      errorElements.forEach((element, index) => {
        console.log(
          `  - Error ${index + 1}: ${
            element.id || element.name || element.className
          } = "${element.value}"`
        );
      });
      return false;
    }

    console.log("✅ Form validation passed - all fields valid");
    return true;
  }

  // Submit form IMMEDIATELY after filling
  async submitFormImmediately() {
    console.log("📤 Submitting form IMMEDIATELY...");

    // Try multiple times with shorter intervals for immediate submission
    for (let i = 0; i < 30; i++) {
      // Try different selectors to find the submit button
      const selectors = [
        'button[data-testid="hosted-payment-submit-button"]',
        'button[type="submit"]',
        ".SubmitButton",
        "button.SubmitButton",
        '[role="button"][data-testid*="submit"]',
        ".SubmitButton--complete",
        ".SubmitButton--pre",
        'button[class*="SubmitButton"]',
      ];

      let submitButton = null;
      for (const selector of selectors) {
        submitButton = document.querySelector(selector);
        if (submitButton) {
          console.log(`🎯 Found submit button with selector: ${selector}`);
          break;
        }
      }

      if (submitButton) {
        console.log(`🔍 Found submit button (attempt ${i + 1}):`, {
          text: submitButton.textContent?.trim(),
          disabled: submitButton.disabled,
          ariaDisabled: submitButton.getAttribute("aria-disabled"),
          classes: submitButton.className,
          visible:
            submitButton.offsetWidth > 0 && submitButton.offsetHeight > 0,
        });

        // Try to click if button is enabled OR if it's just not aria-disabled
        const canClick =
          !submitButton.disabled &&
          submitButton.getAttribute("aria-disabled") !== "true" &&
          submitButton.offsetWidth > 0 &&
          submitButton.offsetHeight > 0;

        if (canClick) {
          console.log("✅ Submit button is ready - CLICKING NOW!");

          // Scroll button into view first
          submitButton.scrollIntoView({ behavior: "instant", block: "center" });
          await this.wait(100);

          // Multiple click attempts for reliability
          submitButton.focus();
          submitButton.click();
          await this.wait(50);

          // Trigger additional events for different frameworks
          submitButton.dispatchEvent(
            new Event("click", { bubbles: true, cancelable: true })
          );
          submitButton.dispatchEvent(
            new MouseEvent("click", { bubbles: true, cancelable: true })
          );
          submitButton.dispatchEvent(
            new MouseEvent("mousedown", { bubbles: true })
          );
          submitButton.dispatchEvent(
            new MouseEvent("mouseup", { bubbles: true })
          );

          // Force click one more time
          submitButton.click();

          console.log("🚀 Submit button clicked multiple times!");
          return true;
        } else {
          console.log(`⏳ Button not ready yet (attempt ${i + 1}), waiting...`);
        }
      } else {
        console.log(`🔍 No submit button found (attempt ${i + 1})`);
      }

      await this.wait(100); // Shorter wait between attempts
    }

    // Last resort: try to find any clickable button with submit-related text
    console.log("🆘 Last resort: searching for any submit-like button...");
    const allButtons = document.querySelectorAll(
      'button, [role="button"], input[type="submit"]'
    );

    for (const button of allButtons) {
      const text = button.textContent?.toLowerCase() || "";
      const value = button.value?.toLowerCase() || "";

      if (
        text.includes("submit") ||
        text.includes("pay") ||
        text.includes("continue") ||
        text.includes("confirm") ||
        text.includes("next") ||
        value.includes("submit") ||
        value.includes("pay")
      ) {
        console.log("🎯 Found potential submit button by text:", text || value);

        if (!button.disabled && button.offsetWidth > 0) {
          console.log("🚀 EMERGENCY CLICK on button:", text || value);
          button.scrollIntoView({ behavior: "instant", block: "center" });
          await this.wait(100);
          button.click();
          button.dispatchEvent(new Event("click", { bubbles: true }));
          return true;
        }
      }
    }

    console.log("❌ Submit button not available after all attempts");
    return false;
  }

  // Legacy submit form function
  async submitForm() {
    return await this.submitFormImmediately();
  }

  // Setup monitoring for Stripe errors after form submission
  setupStripeErrorMonitoring() {
    console.log("🔍 Setting up Stripe error monitoring...");

    // Monitor for error messages on the page
    const checkForErrors = () => {
      // Check for various error indicators
      const errorSelectors = [
        '[role="alert"]',
        ".error-message",
        ".field-error",
        '[class*="error"]',
        '[aria-invalid="true"]',
        ".FieldError",
        ".ErrorText",
      ];

      let hasError = false;
      for (const selector of errorSelectors) {
        const errorElement = document.querySelector(selector);
        if (errorElement && errorElement.textContent.trim()) {
          console.log(
            `❌ Stripe error detected: ${errorElement.textContent.trim()}`
          );
          hasError = true;
          break;
        }
      }

      // Check if the submit button is available again (indicates error)
      const submitButton = document.querySelector(
        this.STRIPE_SELECTORS.SUBMIT_BUTTON
      );
      const buttonAvailableAgain =
        submitButton &&
        !submitButton.disabled &&
        submitButton.getAttribute("aria-disabled") !== "true";

      if (
        hasError ||
        (buttonAvailableAgain && Date.now() - this.lastSubmitTime > 3000)
      ) {
        if (hasError) {
          console.log("🔄 Error detected, resetting form state for retry...");
        } else {
          console.log(
            "🔄 Submit button available again, likely an error occurred..."
          );
        }

        // Reset flags to allow retry with next card
        this.formFilledSuccessfully = false;
        this.waitingForStripeResponse = false;

        // Stop monitoring
        return true;
      }

      return false;
    };

    // Start monitoring with intervals
    const monitoringInterval = setInterval(() => {
      const shouldStop = checkForErrors();

      if (shouldStop) {
        clearInterval(monitoringInterval);
        console.log("🔍 Stripe error monitoring stopped");
      }

      // Stop monitoring after 30 seconds regardless
      if (Date.now() - this.lastSubmitTime > 30000) {
        clearInterval(monitoringInterval);
        console.log("🔍 Stripe error monitoring timeout");
        // Assume success if no errors found in 30 seconds
        this.waitingForStripeResponse = false;
      }
    }, 1000);
  }

  // Start Pro Trial activation with multiple cards (Silent operation)
  async startProTrialActivation(cards) {
    if (this.isActivatingTrial) {
      console.log("⚠️ Pro Trial activation already in progress");
      return;
    }

    if (!cards || cards.length === 0) {
      throw new Error("No cards provided for activation");
    }

    this.isActivatingTrial = true;
    this.cardIndex = 0;
    this.cards = cards;

    // Reset form state
    this.formFilledSuccessfully = false;
    this.waitingForStripeResponse = false;

    try {
      console.log(
        `🚀 Starting Pro Trial activation with ${cards.length} cards...`
      );

      // Wait for page to fully load
      await this.waitForPageLoad();

      // Try each card until success or all cards are exhausted
      await this.tryCardsSequentially();
    } catch (error) {
      console.error("❌ Pro Trial activation failed:", error);
      this.isActivatingTrial = false;
      throw error;
    }
  }

  // Try cards one by one, waiting for Stripe response before moving to next
  async tryCardsSequentially() {
    while (this.cardIndex < this.cards.length && this.isActivatingTrial) {
      console.log(
        `🔄 Trying card ${this.cardIndex + 1}/${this.cards.length}...`
      );

      // Generate payment data with current card
      const paymentData = await this.generatePaymentData();
      paymentData.cards = this.cards;

      // Try to fill and submit the form
      const success = await this.fillStripeForm(paymentData);

      if (success) {
        console.log(
          "✅ Form filled successfully, waiting for Stripe response..."
        );

        // Wait for Stripe response or error detection
        const responseReceived = await this.waitForStripeResponse();

        if (responseReceived === "success") {
          console.log("✅ Payment successful! Activation complete.");
          this.isActivatingTrial = false;
          return;
        } else if (responseReceived === "error") {
          console.log(
            `❌ Card ${this.cardIndex + 1} failed, trying next card...`
          );
          this.cardIndex++;
          // Reset form state for next attempt
          this.formFilledSuccessfully = false;
          this.waitingForStripeResponse = false;
          await this.wait(1000); // Small delay before next card
        } else {
          console.log("⚠️ Timeout waiting for Stripe response");
          this.cardIndex++;
        }
      } else {
        console.log(`❌ Failed to fill form with card ${this.cardIndex + 1}`);
        this.cardIndex++;
      }
    }

    // All cards tried
    console.log("❌ All cards exhausted");
    this.isActivatingTrial = false;
  }

  // Wait for Stripe response (success or error)
  async waitForStripeResponse() {
    return new Promise((resolve) => {
      const maxWaitTime = 30000; // 30 seconds max
      const startTime = Date.now();

      const checkResponse = () => {
        // Check for success indicators (page redirect, success message, etc.)
        if (
          window.location.href !== this.currentUrl ||
          document.querySelector('.success-message, [data-testid*="success"]')
        ) {
          resolve("success");
          return;
        }

        // Check if form state was reset (indicates error detected)
        if (!this.formFilledSuccessfully && !this.waitingForStripeResponse) {
          resolve("error");
          return;
        }

        // Check for timeout
        if (Date.now() - startTime > maxWaitTime) {
          resolve("timeout");
          return;
        }

        // Continue checking
        setTimeout(checkResponse, 1000);
      };

      this.currentUrl = window.location.href;
      checkResponse();
    });
  }

  // Wait for page to fully load
  async waitForPageLoad() {
    console.log("⏳ Waiting for page to fully load...");

    // Wait for document ready state
    if (document.readyState !== "complete") {
      await new Promise((resolve) => {
        if (document.readyState === "complete") {
          resolve();
        } else {
          window.addEventListener("load", resolve, { once: true });
        }
      });
    }

    // Additional wait for dynamic content
    await this.wait(2000);

    // Wait for Stripe scripts to be available
    for (let i = 0; i < 20; i++) {
      if (window.Stripe || document.querySelector('[src*="stripe"]')) {
        console.log("✅ Stripe detected on page");
        break;
      }
      await this.wait(500);
    }

    console.log("✅ Page load complete");
  }

  // Handle OAuth completion on authenticator.cursor.sh
  async handleOAuthCompletion() {
    console.log("🔐 Handling OAuth completion...");

    // Wait for the page to process OAuth
    await this.wait(3000);

    // Look for success indicators or redirect elements
    const successSelectors = [
      'button[type="submit"]',
      'button[data-testid="continue"]',
      'button[data-testid="submit"]',
      ".continue-button",
      ".submit-button",
      'a[href*="cursor.com"]',
    ];

    for (const selector of successSelectors) {
      const element = document.querySelector(selector);
      if (element && element.offsetWidth > 0) {
        console.log(`🖱️ Found OAuth continue element: ${selector}`);
        element.click();
        await this.wait(1000);
        break;
      }
    }

    // If no button found, try to redirect automatically
    setTimeout(() => {
      if (window.location.href.includes("authenticator.cursor.sh")) {
        console.log("🔄 Auto-redirecting to dashboard...");
        window.location.href = "https://cursor.com/dashboard";
      }
    }, 5000);
  }

  // Handle Stripe API response for card switching (Silent operation)
  async handleStripeResponse(message) {
    if (!this.isActivatingTrial) return;

    const statusCode = parseInt(message.statusCode) || 0;

    if (statusCode === 200) {
      // Success!
      this.isActivatingTrial = false;
      // Trigger status refresh
      try {
        chrome.runtime.sendMessage({ type: "refreshStatus" });
      } catch (error) {
        // Ignore if extension context not available
      }
    } else if (statusCode === 402 || statusCode === 400) {
      // Payment error - try next card if available
      if (this.cardIndex + 1 < this.cards.length) {
        this.cardIndex++;

        // Wait a bit before trying next card
        await this.wait(1000);

        // Generate fresh payment data and try next card
        const paymentData = await this.generatePaymentData();
        paymentData.cards = this.cards;

        const success = await this.fillStripeForm(paymentData);
        if (!success) {
          this.isActivatingTrial = false;
        }
      } else {
        // All cards failed
        this.isActivatingTrial = false;
      }
    } else {
      // Other error - stop activation
      this.isActivatingTrial = false;
    }
  }

  // Show trial status (send to extension for UI notification)
  showTrialStatus(message, type = "info") {
    console.log(`[Pro Trial] ${message}`);

    try {
      chrome.runtime.sendMessage({
        type: "trialStatus",
        message: message,
        status: type,
      });
    } catch (error) {
      // Ignore if extension context is not available
    }
  }

  // Silent activation (no UI panel)
  createActivationPanel() {
    // No UI panel created - silent operation
  }

  // Silent progress update
  updateActivationPanel(processed, total, status) {
    // Silent operation - no UI updates
  }

  // Silent cleanup
  removeActivationPanel() {
    // Nothing to remove - silent operation
  }

  // Generic payment form filler (for non-Stripe forms)
  async fillPaymentForm(data) {
    if (!data || !this.isEnabled) return false;

    console.log("💳 Filling payment form with data:", data);

    if (window.location.href.includes("checkout.stripe.com")) {
      return await this.fillStripeForm(data);
    } else {
      return await this.fillGenericForm(data);
    }
  }

  // Fill generic payment forms
  async fillGenericForm(data) {
    console.log("🔧 开始填充通用支付表单...");
    console.log("📋 数据:", { 
      cardCount: data.cards?.length, 
      name: data.name, 
      address: data.address 
    });

    const currentCard = data.cards[0];
    if (!currentCard) {
      console.error("❌ 没有卡片数据");
      return false;
    }

    let filled = 0;

    // Card number - 扩展选择器
    const cardNumberSelectors = [
      'input[autocomplete="cc-number"]',
      'input[name*="card"][name*="number"]',
      'input[name*="cardnumber"]',
      'input[placeholder*="card number" i]',
      'input[placeholder*="卡号" i]',
      'input[id*="card"][id*="number"]',
      'input[type="tel"][name*="card"]',
      '#cardNumber',
      '#card-number',
      '#card_number'
    ];

    console.log("🔍 查找卡号字段...");
    for (const selector of cardNumberSelectors) {
      const field = document.querySelector(selector);
      if (field && this.isFieldReady(field)) {
        console.log(`✅ 找到卡号字段: ${selector}`);
        const success = await this.fillFieldReliably(
          field,
          currentCard.number,
          "卡号 (通用)"
        );
        if (success) filled++;
        break;
      }
    }

    // Expiry - 扩展选择器
    const expirySelectors = [
      'input[autocomplete="cc-exp"]',
      'input[placeholder*="MM" i]',
      'input[placeholder*="expiry" i]',
      'input[placeholder*="有效期" i]',
      'input[name*="expiry"]',
      'input[name*="exp"]',
      '#cardExpiry',
      '#card-expiry'
    ];

    console.log("🔍 查找有效期字段...");
    for (const selector of expirySelectors) {
      const field = document.querySelector(selector);
      if (field && this.isFieldReady(field)) {
        console.log(`✅ 找到有效期字段: ${selector}`);
        const expiryValue = `${currentCard.month.toString().padStart(2, "0")}/${currentCard.year}`;
        const success = await this.fillFieldReliably(field, expiryValue, "有效期 (通用)");
        if (success) filled++;
        break;
      }
    }

    // CVC - 扩展选择器
    const cvcSelectors = [
      'input[autocomplete="cc-csc"]',
      'input[placeholder*="CVC" i]',
      'input[placeholder*="CVV" i]',
      'input[placeholder*="安全码" i]',
      'input[name*="cvc"]',
      'input[name*="cvv"]',
      'input[name*="security"]',
      '#cardCvc',
      '#card-cvc',
      '#cvv',
      '#cvc'
    ];

    console.log("🔍 查找 CVC 字段...");
    for (const selector of cvcSelectors) {
      const field = document.querySelector(selector);
      if (field && this.isFieldReady(field)) {
        console.log(`✅ 找到 CVC 字段: ${selector}`);
        const success = await this.fillFieldReliably(field, currentCard.cvv, "CVC (通用)");
        if (success) filled++;
        break;
      }
    }

    // Name - 扩展选择器
    if (data.name) {
      const nameSelectors = [
        'input[autocomplete="cc-name"]',
        'input[autocomplete="name"]',
        'input[name*="name"]',
        'input[name*="cardholder"]',
        'input[placeholder*="name" i]',
        'input[placeholder*="姓名" i]',
        '#billingName',
        '#billing-name',
        '#cardholder-name'
      ];

      console.log("🔍 查找姓名字段...");
      for (const selector of nameSelectors) {
        const field = document.querySelector(selector);
        if (field && this.isFieldReady(field)) {
          console.log(`✅ 找到姓名字段: ${selector}`);
          const success = await this.fillFieldReliably(field, data.name, "姓名 (通用)");
          if (success) filled++;
          break;
        }
      }
    }

    // Address fields
    if (data.address) {
      console.log("🏠 填充地址信息...");
      
      // Postal code
      const postalSelectors = [
        'input[autocomplete="postal-code"]',
        'input[name*="postal"]',
        'input[name*="zip"]',
        'input[placeholder*="邮编" i]',
        '#billingPostalCode',
        '#postal-code'
      ];
      
      for (const selector of postalSelectors) {
        const field = document.querySelector(selector);
        if (field && this.isFieldReady(field)) {
          await this.fillFieldReliably(field, data.address.postalCode, "邮编");
          break;
        }
      }

      // City
      const citySelectors = [
        'input[autocomplete="address-level2"]',
        'input[name*="city"]',
        'input[placeholder*="城市" i]',
        '#billingLocality'
      ];
      
      for (const selector of citySelectors) {
        const field = document.querySelector(selector);
        if (field && this.isFieldReady(field)) {
          await this.fillFieldReliably(field, data.address.city, "城市");
          break;
        }
      }

      // Address line
      const addressSelectors = [
        'input[autocomplete="address-line1"]',
        'input[name*="address"]',
        'input[placeholder*="地址" i]',
        '#billingAddressLine1'
      ];
      
      for (const selector of addressSelectors) {
        const field = document.querySelector(selector);
        if (field && this.isFieldReady(field)) {
          await this.fillFieldReliably(field, data.address.street, "地址");
          break;
        }
      }
    }

    console.log(`✅ 通用表单填充完成，成功填充 ${filled} 个主要字段`);
    return filled > 0;
  }

  // 手动填充支付表单（通过按钮触发）
  async fillPaymentFormManual() {
    console.log("🚀 手动填充表单");

    // 重新加载数据确保是最新的
    await this.loadStoredData();

    if (!this.generatedData) {
      console.error("❌ 没有找到生成的支付数据");
      throw new Error("请先生成支付数据");
    }

    console.log("📋 使用存储的数据:", this.generatedData);

    // 检测是否为 Stripe 页面
    if (window.location.href.includes("checkout.stripe.com")) {
      console.log("🎯 检测到 Stripe 支付页面");
      return this.fillStripeForm(this.generatedData);
    } else {
      console.log("🎯 检测到通用支付页面");
      return this.fillGenericForm(this.generatedData);
    }
  }

  // Wait for page to be fully loaded
  async waitForPageLoad() {
    if (document.readyState !== "complete") {
      await new Promise((resolve) => {
        const checkReady = () => {
          if (document.readyState === "complete") {
            resolve();
          } else {
            setTimeout(checkReady, 100);
          }
        };
        checkReady();
      });
    }
    await this.wait(500); // Additional buffer
  }

  // Utility wait function
  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Initialize when DOM is ready and setup auto-fill on page load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    window.autoFillManager = new AutoFillManager();
    // Auto-fill form if we're on a payment page and have stored data
    if (
      window.location.href.includes("checkout.stripe.com") &&
      window.autoFillManager.generatedData
    ) {
      setTimeout(() => {
        // Only fill if not already filled
        if (!window.autoFillManager.formFilledSuccessfully) {
          window.autoFillManager.fillStripeForm(
            window.autoFillManager.generatedData
          );
        } else {
          console.log(
            "⚠️ Form already filled, skipping auto-fill on page load"
          );
        }
      }, 2000);
    }
  });
} else {
  window.autoFillManager = new AutoFillManager();
  // Auto-fill form if we're on a payment page and have stored data
  if (
    window.location.href.includes("checkout.stripe.com") &&
    window.autoFillManager.generatedData
  ) {
    setTimeout(() => {
      // Only fill if not already filled
      if (!window.autoFillManager.formFilledSuccessfully) {
        window.autoFillManager.fillStripeForm(
          window.autoFillManager.generatedData
        );
      } else {
        console.log("⚠️ Form already filled, skipping auto-fill on page load");
      }
    }, 2000);
  }
}
