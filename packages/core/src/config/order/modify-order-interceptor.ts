import { ModifyOrderInput } from '@vendure/common/lib/generated-types';
import { RequestContext } from '../../api/common/request-context';
import { InjectableStrategy } from '../../common/types/injectable-strategy';
import { CustomOrderLineFields, Order, OrderLine, ProductVariant } from '../../entity/index';

export interface WillAddItemToOrderInput {
    productVariant: ProductVariant;
    quantity: number;
    customFields?: CustomOrderLineFields;
}

export interface WillAdjustOrderLineInput {
    orderLine: OrderLine;
    quantity: number;
    customFields?: CustomOrderLineFields;
}

/**
 * @description
 * A ModifyOrderInterceptor is a class which can be used to intercept and modify the behavior of modify order-related
 * operations.
 *
 * It does this by providing methods which are called whenever the contents of a placed order are about
 * to get modified. These methods are able to prevent the operation from proceeding by returning a string
 * error message.
 *
 * Examples of use-cases for an ModifyOrderInterceptor include:
 *
 * * Removing payment method related surcharges before recalculation
 * * Reapplying payment method related surcharges after recalculation
 *
 * Any changes to the order during the interceptor phase should *not* be saved as this may interfere with the `dryRun` process.
 * This means that if e.g. you remove a surcharge in the interceptor, you should set it on the order
 * 
 * `order.surcharges = filteredSurcharges`
 *
 * and allow the `modifyOrder` function to process the surcharges. 
 *
 * :::info
 *
 * This is configured via the `orderOptions.modifyOrderInterceptors` property of
 * your VendureConfig.
 *
 * :::
 *
 * ModifyOrderInterceptors are executed when the following mutations are called:
 *
 * - `modifyOrder`
 *
 * Additionally, if you are working directly with the {@link OrderService}, the following methods will trigger
 * any registered ModifyOrderInterceptors:
 *
 * - `modifyOrder`
 *
 * When a ModifyOrderInterceptor is registered, it will be called in the order in which it was registered.
 * If an interceptor method resolves to a string, the operation will be prevented and the string will be used as the error message.
 *
 * When multiple interceptors are registered, the first interceptor to resolve to a string will prevent the operation from proceeding.
 *
 * Errors returned by ModifyOrderInterceptors are surfaced to the GraphQL API as an `ModifyOrderInterceptorError` and can be
 * queried like this:
 *
 * ```graphql
 * mutation modifyOrder($input: ModifyOrderInput!) {
 *   modifyOrder(input: $input) {
 *     ... on Order {
 *       id
 *       code
 *       # ... other Order fields
 *     }
 *     ... on ErrorResult {
 *       errorCode
 *       message
 *     }
 *     // highlight-start
 *     ... on ModifyOrderInterceptorError {
 *       interceptorError
 *     }
 *     // highlight-end
 *   }
 * }
 * ```
 *
 * In the above example, the error message returned by the ModifyOrderInterceptor would be available in the `interceptorError` field.
 *
 * ## Example: Payment Surcharge
 *
 * Let's say we want to allow a PaymentMethod dependent surcharge. Whenever an order is modified, the surcharge needs to be recalculated
 * based on the original order value minus the original surcharge.
 * then after modification is processed, the surcharge has to be reapplied on the resulting order value
 *
 * @example
 * ```ts
 * import {
 *   EntityHydrator,
 *   Injector,
 *   LanguageCode,
 *   Order,
 *   OrderInterceptor,
 *   OrderService,
 *   RequestContext,
 *   TranslatorService,
 *   VendurePlugin,
 *   WillAddItemToOrderInput,
 *   WillAdjustOrderLineInput,
 * } from '\@vendure/core';
 *
 * declare module '\@vendure/core/dist/entity/custom-entity-fields' {
 *   interface CustomOrderFields {
 *     paymentMethodCode?: string;
 *   }
 *
 *   interface CustomPaymentMethodFields {
 *     surcharge?: number;
 *     surchargeType?: 'percentage' | 'amount'
 *   }
 * }
 *
 * // This ModifyOrderInterceptor removes a payment surcharge and recalculates after order modification processing
 * export class PaymentSurchargeModifyOrderInterceptor implements ModifyOrderInterceptor {
 *  private entityHydrator: EntityHydrator;
 *  private orderService: OrderService;
 *
 *  init(injector: Injector) {
 *    this.entityHydrator = injector.get(EntityHydrator);
 *    this.orderService = injector.get(OrderService);
 *  }
 *
 *  willModifyOrder(
 *    ctx: RequestContext,
 *    order: Order,
 *    input: ModifyOrderInput,
 *  ): Promise<void | string> | void | string {
 *    const { surcharges } = order;
 *    const filteredSurcharges = surcharges.filter(s => s.code !== `PM-SUR-${order.id}`);
 *    order.surcharges = filteredSurcharges;
 *.   // the order price will be recalculated based on the modifyOrderInput and existing surcharges, promotions, etc
 *  }
 *
 *  async hasModifiedOrder(
 *    ctx: RequestContext,
 *    order: Order,
 *    input: ModifyOrderInput,
 *  ): Promise<void | string> | void | string {
 *    const paymentMethod = await this.getPaymentMethodCode(order);
 *    const { surcharge, surchargeType } = paymentMethod.customFields ?? {};
 *    if (surcharge){
 *      // TODO
 *    }
 *  }
 *
 * }
 *
 * // This plugin adds paymentMethod related surcharges. 
 * // It adds two new custom fields to PaymentMethod:
 * // - surcharge
 * // - surchargeType
 * // 
 * // It also adds a custom field to Order that represents the selected payment method:
 * // - paymentMethodCode
 * //
 * // It also adds an ModifyOrderInterceptor which processed surcharges removal and application before and after modification
 * \@VendurePlugin({
 *  configuration: config => {
 *    config.customFields.Order.push({
 *      type: 'string',
 *      name: 'paymentMethodCode',
 *      label: [{ languageCode: LanguageCode.en, value: 'Payment method code' }],
 *      readOnly: true,
 *      nullable: true,
 *    });
 *    config.customFields.PaymentMethod.push({
 *      type: 'int',
 *      name: 'surcharge',
 *      label: [{ languageCode: LanguageCode.en, value: 'Surcharge' }],
 *      nullable: true,
 *    });
 *    config.customFields.PaymentMethod.push({
 *      type: 'string',
 *      name: 'surchargeType',
 *      label: [{ languageCode: LanguageCode.en, value: 'SurchargeType' }],
 *      nullable: true,
 *      options: [
 *            {
 *              value: 'percentage',
 *              label: [{ languageCode: LanguageCode.en, value: 'Percentage' }],
 *            },
 *            {
 *              value: 'amount',
 *              label: [{ languageCode: LanguageCode.en, value: 'Flat rate' }],
 *            },
 *          ],
 *      ui: {
 *            component: 'select-form-input',
 *            options: [
 *              {
 *                value: 'percentage',
 *                label: [{ languageCode: LanguageCode.en, value: 'Percentage' }],
 *              },
 *              {
 *                value: 'amount',
 *                label: [{ languageCode: LanguageCode.en, value: 'Flat rate' }],
 *              },
 *            ],
 *          },
 *    });
 *
 *    // Here we add the PaymentSurchargeModifyOrderInterceptor to the modifyOrderInterceptors array
 *    config.orderOptions.modifyOrderInterceptors.push(new PaymentSurchargeModifyOrderInterceptor());
 *    return config;
 *  },
 * })
 * export class PaymentMethodSurchargePlugin {}
 * ```
 *
 *
 * @docsCategory orders
 * @docsPage ModifyOrderInterceptor
 * @docsWeight 0
 * @since 3.1.0
 */
export interface ModifyOrderInterceptor extends InjectableStrategy {
    /**
     * @description
     * Called when a new item is about to be added to the order,
     * as in the `addItemToOrder` mutation or the `addItemToOrder()` / `addItemsToOrder()` method
     * of the {@link OrderService}.
     */
    willModifyOrder?(
        ctx: RequestContext,
        order: Order,
        input: ModifyOrderInput,
    ): Promise<void | string> | void | string;

    /**
     * @description
     * Called when an item is about to be removed from the order,
     * as in the `removeItemFromOrder` mutation or the `removeItemFromOrder()` / `removeItemsFromOrder()` method
     * of the {@link OrderService}.
     */
    hasModifiedOrder?(
        ctx: RequestContext,
        order: Order,
        input: ModifyOrderInput,
    ): Promise<void | string> | void | string;
}
