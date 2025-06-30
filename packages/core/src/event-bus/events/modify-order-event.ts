import { RequestContext } from '../../api/common/request-context';
import { OrderModification } from '../../entity/order-modification/order-modification.entity';
import { Order } from '../../entity/order/order.entity';
import { VendureEvent } from '../vendure-event';

/**
 * @description
 * This event is fired whenever an {@link Order} is modified.
 *
 * @docsCategory events
 * @docsPage Event Types
 */
export class ModifyOrderEvent extends VendureEvent {
    constructor(
        public ctx: RequestContext,
        public order: Order,
        public modification: OrderModification,
    ) {
        super();
    }
}
