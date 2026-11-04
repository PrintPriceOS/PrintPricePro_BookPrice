const { query } = require('./mysqlClient');

/**
 * Maps a MySQL row to a Dispatch Package object.
 */
/**
 * Maps a MySQL row to a Dispatch Package object.
 */
const mapRowToPackage = (row) => {
    if (!row) return null;
    return {
        package_id: row.package_id,
        order_intent_id: row.order_intent_id,
        public_ref: row.public_ref,
        printhouse_id: row.printhouse_id,
        status: row.status,
        production_queue: row.production_queue_json,
        ...row.payload_json,
        access: row.access_json,
        created_at: row.created_at,
        updated_at: row.updated_at,
        expires_at: row.expires_at,
        revoked_at: row.revoked_at
    };
};

module.exports = {
    async create(pkg) {
        const { package_id, order_intent_id, public_ref, printhouse_id, status, access, production_queue, expires_at, created_at, updated_at, ...payload } = pkg;
        
        await query(
            `INSERT INTO marketplace_dispatch_packages 
            (package_id, order_intent_id, public_ref, printhouse_id, status, production_queue_json, payload_json, access_json, expires_at, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                package_id,
                order_intent_id,
                public_ref,
                printhouse_id,
                status,
                JSON.stringify(production_queue || null),
                JSON.stringify(payload),
                JSON.stringify(access),
                expires_at,
                created_at,
                updated_at
            ]
        );
        console.log(`[MYSQL_REPO][DISPATCH_PACKAGE_CREATED] id=${package_id} intent=${order_intent_id}`);
        return pkg;
    },

    async getById(package_id) {
        const rows = await query(`SELECT * FROM marketplace_dispatch_packages WHERE package_id = ?`, [package_id]);
        return mapRowToPackage(rows[0]);
    },

    async getByOrderIntentId(order_intent_id) {
        const rows = await query(`SELECT * FROM marketplace_dispatch_packages WHERE order_intent_id = ?`, [order_intent_id]);
        return mapRowToPackage(rows[0]);
    },

    async updateStatus(package_id, status, patch = {}) {
        const pkg = await this.getById(package_id);
        if (!pkg) return false;

        const updatedStatus = status || pkg.status;
        const updatedRevokedAt = status === 'REVOKED' ? new Date().toISOString() : pkg.revoked_at;
        const updatedAccess = { ...pkg.access, ...patch.access };
        
        await query(
            `UPDATE marketplace_dispatch_packages 
             SET status = ?, access_json = ?, revoked_at = ?, updated_at = NOW() 
             WHERE package_id = ?`,
            [updatedStatus, JSON.stringify(updatedAccess), updatedRevokedAt, package_id]
        );
        return true;
    },

    async updateProductionQueue(package_id, queueData) {
        await query(
            `UPDATE marketplace_dispatch_packages 
             SET production_queue_json = ?, updated_at = NOW() 
             WHERE package_id = ?`,
            [JSON.stringify(queueData), package_id]
        );
        return true;
    },

    async listByPrinthouse(printhouse_id, filters = {}) {
        let sql = `SELECT * FROM marketplace_dispatch_packages WHERE 1=1`;
        const params = [];

        if (printhouse_id) {
            sql += ` AND printhouse_id = ?`;
            params.push(printhouse_id);
        }

        if (filters.status) {
            // Check production_queue.status if we want to filter by that
            // For simplicity in Phase 12, we'll extract it using JSON_EXTRACT
            sql += ` AND JSON_EXTRACT(production_queue_json, '$.status') = ?`;
            params.push(filters.status);
        }

        sql += ` ORDER BY created_at DESC`;
        
        if (filters.limit) {
            const lim = parseInt(filters.limit, 10) || 50;
            const off = parseInt(filters.offset || 0, 10) || 0;
            sql += ` LIMIT ${lim} OFFSET ${off}`;
        }

        const rows = await query(sql, params);
        return rows.map(mapRowToPackage);
    },

    async incrementAccess(package_id) {
        const pkg = await this.getById(package_id);
        if (!pkg) return false;

        const updatedAccess = {
            ...pkg.access,
            access_count: (pkg.access?.access_count || 0) + 1,
            last_accessed_at: new Date().toISOString()
        };

        await query(
            `UPDATE marketplace_dispatch_packages 
             SET access_json = ?, updated_at = NOW() 
             WHERE package_id = ?`,
            [JSON.stringify(updatedAccess), package_id]
        );
        return true;
    },

    async health() {
        const total = await query(`SELECT COUNT(*) as count FROM marketplace_dispatch_packages`);
        const byStatus = await query(`SELECT status, COUNT(*) as count FROM marketplace_dispatch_packages GROUP BY status`);
        const byQueueStatus = await query(`SELECT JSON_EXTRACT(production_queue_json, '$.status') as queue_status, COUNT(*) as count FROM marketplace_dispatch_packages GROUP BY queue_status`);
        
        return {
            total: total[0].count,
            by_status: byStatus.reduce((acc, row) => ({ ...acc, [row.status]: row.count }), {}),
            by_queue_status: byQueueStatus.reduce((acc, row) => ({ ...acc, [row.queue_status || 'null']: row.count }), {})
        };
    }
};
